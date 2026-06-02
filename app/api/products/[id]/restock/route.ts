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

type RestockBody = {
  quantity?: unknown;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const limit = rateLimit(clientKey(req, "product-restock"), {
    limit: 60,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    requireOwner(req);

    const { id } = await context.params;
    const productId = Number(id);
    const { quantity } = await parseJsonBody<RestockBody>(req, 1024);
    const qty = Number(quantity);

    if (!Number.isInteger(productId) || productId <= 0) {
      return jsonError("Invalid product id");
    }

    if (!Number.isInteger(qty) || qty <= 0 || qty > 100000) {
      return jsonError("Enter a valid restock quantity");
    }

    const supabase = createServiceSupabaseClient();
    const { data: product, error: lookupError } = await supabase
      .from("products")
      .select("id, stock")
      .eq("id", productId)
      .single();

    if (lookupError || !product) {
      return jsonError("Product not found", 404);
    }

    const nextStock = Number(product.stock || 0) + qty;
    const { data: updated, error } = await supabase
      .from("products")
      .update({
        stock: nextStock,
        opening_stock: nextStock,
      })
      .eq("id", productId)
      .select()
      .single();

    if (error) {
      console.error("Restock failed:", error);
      return jsonError("Unable to restock product", 500);
    }

    return NextResponse.json({ product: updated });
  } catch (error) {
    if (error instanceof AuthError || error instanceof RequestBodyError) {
      return jsonError(error.message, error.status);
    }

    console.error("Restock failed:", error);
    return jsonError("Unable to restock product", 500);
  }
}
