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

type ReviewBody = {
  ownerAmount?: unknown;
  status?: unknown;
  note?: unknown;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const limit = rateLimit(clientKey(req, "cash-counts-review"), {
    limit: 30,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    requireOwner(req);
    const ownerName = req.cookies.get("staff_name")!.value;

    const { id } = await context.params;
    const countId = Number(id);

    if (!Number.isInteger(countId) || countId <= 0) {
      return jsonError("Invalid cash count id");
    }

    const { ownerAmount, status, note } = await parseJsonBody<ReviewBody>(req, 2048);
    const amount = Number(ownerAmount);

    if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
      return jsonError("Enter a valid amount");
    }

    if (status !== "confirmed" && status !== "discrepancy") {
      return jsonError("Invalid review status");
    }

    const supabase = createServiceSupabaseClient();
    const { data: updated, error } = await supabase
      .from("cash_counts")
      .update({
        owner_amount: amount,
        owner_name: ownerName,
        owner_note: typeof note === "string" ? note.trim().slice(0, 500) : null,
        status,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", countId)
      .select()
      .single();

    if (error || !updated) {
      console.error("Cash count review failed:", error);
      return jsonError("Unable to submit review", 500);
    }

    return NextResponse.json({ count: updated });
  } catch (error) {
    if (error instanceof AuthError || error instanceof RequestBodyError) {
      return jsonError(error.message, error.status);
    }

    console.error("Cash count review failed:", error);
    return jsonError("Unable to submit review", 500);
  }
}
