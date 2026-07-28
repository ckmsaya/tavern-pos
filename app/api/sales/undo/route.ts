import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  clientKey,
  jsonError,
  parseJsonBody,
  rateLimit,
  rateLimitResponse,
  requireStaffSession,
  RequestBodyError,
} from "@/lib/api-security";
import { createServiceSupabaseClient } from "@/lib/server-supabase";

type UndoBody = {
  saleIds?: unknown;
};

export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "sales-undo"), {
    limit: 30,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    requireStaffSession(req);

    const body = await parseJsonBody<UndoBody>(req, 4096);
    const saleIds = Array.isArray(body.saleIds)
      ? body.saleIds.filter((id): id is number => Number.isInteger(id) && id > 0).slice(0, 50)
      : [];

    if (!saleIds.length) {
      return jsonError("No valid sale ids provided");
    }

    const supabase = createServiceSupabaseClient();

    const { data: sales, error: fetchError } = await supabase
      .from("sales")
      .select("id, product_id, quantity")
      .in("id", saleIds);

    if (fetchError) {
      console.error("Undo lookup failed:", fetchError);
      return jsonError("Unable to undo sale", 500);
    }

    for (const sale of sales ?? []) {
      if (!sale.product_id) continue;

      const { data: product, error: productError } = await supabase
        .from("products")
        .select("stock")
        .eq("id", sale.product_id)
        .single();

      if (productError || !product) continue;

      const { error: stockError } = await supabase
        .from("products")
        .update({ stock: Number(product.stock || 0) + sale.quantity })
        .eq("id", sale.product_id);

      if (stockError) {
        console.error("Undo stock restore failed:", stockError);
      }
    }

    const { error: deleteError } = await supabase
      .from("sales")
      .delete()
      .in("id", saleIds);

    if (deleteError) {
      console.error("Undo delete failed:", deleteError);
      return jsonError("Unable to undo sale", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError || error instanceof RequestBodyError) {
      return jsonError(error.message, error.status);
    }

    console.error("Undo sale failed:", error);
    return jsonError("Unable to undo sale", 500);
  }
}
