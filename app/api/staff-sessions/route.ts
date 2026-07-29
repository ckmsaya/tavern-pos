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

export async function GET(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "staff-sessions-list"), {
    limit: 60,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    requireOwner(req);

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
