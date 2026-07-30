import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  clientKey,
  jsonError,
  parseJsonBody,
  rateLimit,
  rateLimitResponse,
  requireOwner,
  requireStaffSession,
  RequestBodyError,
} from "@/lib/api-security";
import { createServiceSupabaseClient } from "@/lib/server-supabase";

type CashCountBody = {
  counted_amount?: unknown;
};

export async function GET(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "cash-counts-list"), {
    limit: 60,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    requireOwner(req);

    const { searchParams } = new URL(req.url);
    const since = searchParams.get("since");

    const supabase = createServiceSupabaseClient();
    let query = supabase.from("cash_counts").select("*");

    if (since) {
      query = query.gte("created_at", since).order("created_at", { ascending: true });
    } else {
      query = query.order("created_at", { ascending: false }).limit(30);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Cash counts fetch failed:", error);
      return jsonError("Unable to load cash counts", 500);
    }

    return NextResponse.json({ counts: data ?? [] });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.status);
    }

    console.error("Cash counts fetch failed:", error);
    return jsonError("Unable to load cash counts", 500);
  }
}

export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "cash-counts-create"), {
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    const staff = requireStaffSession(req);

    const { counted_amount } = await parseJsonBody<CashCountBody>(req, 1024);
    const countedAmount = Number(counted_amount);

    if (!Number.isFinite(countedAmount) || countedAmount < 0 || countedAmount > 1_000_000) {
      return jsonError("Enter a valid cash amount");
    }

    const supabase = createServiceSupabaseClient();

    const { data: lastConfirmed } = await supabase
      .from("cash_counts")
      .select("created_at")
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const since = lastConfirmed?.created_at ?? new Date().toISOString().split("T")[0];

    const { data: cashSales, error: salesError } = await supabase
      .from("sales")
      .select("total")
      .eq("payment_method", "cash")
      .gt("created_at", since);

    if (salesError) {
      console.error("Cash count expected-cash lookup failed:", salesError);
      return jsonError("Unable to submit cash count", 500);
    }

    const expectedCash = (cashSales ?? []).reduce((sum, row) => sum + (Number(row.total) || 0), 0);

    const { error: insertError } = await supabase.from("cash_counts").insert({
      staff_name: staff.name,
      counted_amount: countedAmount,
      expected_cash: expectedCash,
      status: "pending",
    });

    if (insertError) {
      console.error("Cash count insert failed:", insertError);
      return jsonError("Unable to submit cash count", 500);
    }

    // Deliberately not returning expected_cash — the count is meant to be blind.
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError || error instanceof RequestBodyError) {
      return jsonError(error.message, error.status);
    }

    console.error("Cash count submit failed:", error);
    return jsonError("Unable to submit cash count", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "cash-counts-clear"), {
    limit: 10,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    requireOwner(req);

    const supabase = createServiceSupabaseClient();
    const { error } = await supabase.from("cash_counts").delete().not("id", "is", null);

    if (error) {
      console.error("Cash counts clear failed:", error);
      return jsonError("Unable to clear cash counts", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.status);
    }

    console.error("Cash counts clear failed:", error);
    return jsonError("Unable to clear cash counts", 500);
  }
}
