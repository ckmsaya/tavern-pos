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

type PinBody = {
  pin?: unknown;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const limit = rateLimit(clientKey(req, "staff-pin-reset"), {
    limit: 30,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    requireOwner(req);

    const { id } = await context.params;
    const staffId = Number(id);

    if (!Number.isInteger(staffId) || staffId <= 0) {
      return jsonError("Invalid staff id");
    }

    const { pin } = await parseJsonBody<PinBody>(req, 1024);
    const normalizedPin = typeof pin === "string" ? pin.trim() : "";

    if (!/^\d{4,12}$/.test(normalizedPin)) {
      return jsonError("PIN must be 4-12 digits");
    }

    const supabase = createServiceSupabaseClient();

    const { data: hashed, error: hashError } = await supabase
      .rpc("hash_staff_pin", { input_pin: normalizedPin });

    if (hashError || !hashed) {
      console.error("PIN hash failed:", hashError);
      return jsonError("Unable to reset PIN", 500);
    }

    const { data: updated, error } = await supabase
      .from("staff")
      .update({ hashed_pin: hashed })
      .eq("id", staffId)
      .select("id, name, role, created_at")
      .single();

    if (error || !updated) {
      console.error("PIN reset failed:", error);
      return jsonError("Unable to reset PIN", 500);
    }

    return NextResponse.json({ staff: updated });
  } catch (error) {
    if (error instanceof AuthError || error instanceof RequestBodyError) {
      return jsonError(error.message, error.status);
    }

    console.error("PIN reset failed:", error);
    return jsonError("Unable to reset PIN", 500);
  }
}
