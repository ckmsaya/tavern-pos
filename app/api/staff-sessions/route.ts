import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  clientKey,
  jsonError,
  rateLimit,
  rateLimitResponse,
  requireOwner,
} from "@/lib/api-security";
import { getStaffSessionsReport } from "@/lib/staff-sessions";
import { createServiceSupabaseClient } from "@/lib/server-supabase";

export async function GET(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "staff-sessions-list"), {
    limit: 60,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    await requireOwner(req);

    const { searchParams } = new URL(req.url);
    const since = searchParams.get("since") ?? new Date().toISOString().split("T")[0];

    const sessions = await getStaffSessionsReport(since);

    return NextResponse.json({ sessions });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.status);
    }

    console.error("Staff sessions fetch failed:", error);
    return jsonError("Unable to load staff sessions", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "staff-sessions-clear"), {
    limit: 10,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    await requireOwner(req);

    const supabase = createServiceSupabaseClient();
    const { error } = await supabase.from("staff_sessions").delete().not("id", "is", null);

    if (error) {
      console.error("Staff sessions clear failed:", error);
      return jsonError("Unable to clear staff activity", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.status);
    }

    console.error("Staff sessions clear failed:", error);
    return jsonError("Unable to clear staff activity", 500);
  }
}
