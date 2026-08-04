import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  clientKey,
  jsonError,
  parseJsonBody,
  rateLimit,
  rateLimitResponse,
  requireOwner,
  RequestBodyError,
} from "@/lib/api-security";
import { createServiceSupabaseClient } from "@/lib/server-supabase";

type StaffBody = {
  name?: unknown;
  role?: unknown;
  pin?: unknown;
};

function text(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "staff-list"), {
    limit: 60,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    await requireOwner(req);

    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from("staff")
      .select("id, name, role, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Staff list failed:", error);
      return jsonError("Unable to load staff", 500);
    }

    return NextResponse.json({ staff: data ?? [] });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.status);
    }

    console.error("Staff list failed:", error);
    return jsonError("Unable to load staff", 500);
  }
}

export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "staff-create"), {
    limit: 30,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    await requireOwner(req);

    const body = await parseJsonBody<StaffBody>(req, 1024);
    const name = text(body.name);
    const role = body.role === "owner" ? "owner" : "staff";
    const pin = text(body.pin, 12);

    if (!name) {
      return jsonError("Staff name is required");
    }

    if (!/^\d{4,12}$/.test(pin)) {
      return jsonError("PIN must be 4-12 digits");
    }

    const supabase = createServiceSupabaseClient();

    const { data: hashed, error: hashError } = await supabase
      .rpc("hash_staff_pin", { input_pin: pin });

    if (hashError || !hashed) {
      console.error("PIN hash failed:", hashError);
      return jsonError("Unable to create staff member", 500);
    }

    const { data: created, error } = await supabase
      .from("staff")
      .insert({ name, role, hashed_pin: hashed })
      .select("id, name, role, created_at")
      .single();

    if (error) {
      console.error("Staff create failed:", error);
      return jsonError("Unable to create staff member", 500);
    }

    return NextResponse.json({ staff: created }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError || error instanceof RequestBodyError) {
      return jsonError(error.message, error.status);
    }

    console.error("Staff create failed:", error);
    return jsonError("Unable to create staff member", 500);
  }
}
