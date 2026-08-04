import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  clientKey,
  jsonError,
  rateLimit,
  rateLimitResponse,
  requireOwner,
} from "@/lib/api-security";
import { createServiceSupabaseClient } from "@/lib/server-supabase";

export async function GET(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "undo-log"), {
    limit: 60,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    await requireOwner(req);

    const { searchParams } = new URL(req.url);
    const since = searchParams.get("since");

    const supabase = createServiceSupabaseClient();
    let query = supabase.from("undo_audit_log").select("*");

    if (since) {
      query = query.gte("created_at", since).order("created_at", { ascending: true });
    } else {
      query = query.order("created_at", { ascending: false }).limit(50);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Undo log fetch failed:", error);
      return jsonError("Unable to load undo log", 500);
    }

    return NextResponse.json({ entries: data ?? [] });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.status);
    }

    console.error("Undo log fetch failed:", error);
    return jsonError("Unable to load undo log", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "undo-log-clear"), {
    limit: 10,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    await requireOwner(req);

    const supabase = createServiceSupabaseClient();
    const { error } = await supabase.from("undo_audit_log").delete().not("id", "is", null);

    if (error) {
      console.error("Undo log clear failed:", error);
      return jsonError("Unable to clear undo log", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.status);
    }

    console.error("Undo log clear failed:", error);
    return jsonError("Unable to clear undo log", 500);
  }
}
