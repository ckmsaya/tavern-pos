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
    requireOwner(req);

    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from("undo_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

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
