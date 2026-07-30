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

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const limit = rateLimit(clientKey(req, "staff-delete"), {
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

    const supabase = createServiceSupabaseClient();

    const { data: target, error: lookupError } = await supabase
      .from("staff")
      .select("id, role")
      .eq("id", staffId)
      .maybeSingle();

    if (lookupError) {
      console.error("Staff lookup failed:", lookupError);
      return jsonError("Unable to remove staff member", 500);
    }

    if (!target) {
      return jsonError("Staff member not found", 404);
    }

    if (target.role === "owner") {
      const { count, error: countError } = await supabase
        .from("staff")
        .select("id", { count: "exact", head: true })
        .eq("role", "owner");

      if (countError) {
        console.error("Owner count failed:", countError);
        return jsonError("Unable to remove staff member", 500);
      }

      if ((count ?? 0) <= 1) {
        return jsonError("Cannot remove the last owner account", 409);
      }
    }

    const { error } = await supabase.from("staff").delete().eq("id", staffId);

    if (error) {
      console.error("Staff delete failed:", error);
      return jsonError("Unable to remove staff member", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.status);
    }

    console.error("Staff delete failed:", error);
    return jsonError("Unable to remove staff member", 500);
  }
}
