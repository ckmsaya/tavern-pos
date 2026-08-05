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
import { businessDateString, businessDayStartUTC } from "@/lib/business-day";

export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "reset-day"), {
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    await requireOwner(req);

    const supabase = createServiceSupabaseClient();
    // Scoped to today only — this was previously an unconditional delete
    // that wiped the entire sales table regardless of date, silently
    // contradicting the "delete all today's sales" warning shown before
    // this is called (see the Reset Day modal in app/dashboard/page.tsx).
    const todayStart = businessDayStartUTC(businessDateString());
    const { error: salesError } = await supabase
      .from("sales")
      .delete()
      .gte("created_at", todayStart);

    if (salesError) {
      console.error("Reset sales delete failed:", salesError);
      return jsonError("Unable to reset sales", 500);
    }

    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id, stock");

    if (productError || !products) {
      console.error("Reset product lookup failed:", productError);
      return jsonError("Unable to reset opening stock", 500);
    }

    for (const product of products) {
      const { error } = await supabase
        .from("products")
        .update({ opening_stock: product.stock })
        .eq("id", product.id);

      if (error) {
        console.error("Reset product update failed:", error);
        return jsonError("Unable to reset opening stock", 500);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.status);
    }

    console.error("Reset day failed:", error);
    return jsonError("Unable to reset day", 500);
  }
}
