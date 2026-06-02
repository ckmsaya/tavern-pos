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

type SaleItem = {
  productId?: unknown;
  quantity?: unknown;
  price?: unknown;
};

type SaleBody = {
  payment?: unknown;
  items?: unknown;
  businessId?: unknown;
};

function validPayment(value: unknown) {
  return value === "card" ? "card" : "cash";
}

export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "sales-create"), {
    limit: 120,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    const staff = requireStaffSession(req);
    const body = await parseJsonBody<SaleBody>(req, 16 * 1024);
    const rawItems = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
    const items = rawItems.map((item) => {
      const saleItem = item as SaleItem;
      return {
        productId: Number(saleItem.productId),
        quantity: Number(saleItem.quantity),
        price: Number(saleItem.price),
      };
    });

    if (!items.length) {
      return jsonError("Sale must include at least one item");
    }

    if (
      items.some(
        (item) =>
          !Number.isInteger(item.productId) ||
          item.productId <= 0 ||
          !Number.isInteger(item.quantity) ||
          item.quantity <= 0 ||
          item.quantity > 1000 ||
          !Number.isFinite(item.price) ||
          item.price < 0
      )
    ) {
      return jsonError("Sale contains invalid items");
    }

    const businessId = typeof body.businessId === "string" && body.businessId.trim()
      ? body.businessId.trim()
      : null;
    const payment = validPayment(body.payment);
    const supabase = createServiceSupabaseClient();
    const saleIds: number[] = [];

    for (const item of items) {
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("id, stock")
        .eq("id", item.productId)
        .single();

      if (productError || !product) {
        return jsonError("Product not found", 404);
      }

      const currentStock = Number(product.stock || 0);
      if (currentStock < item.quantity) {
        return jsonError("Not enough stock for one or more items", 409);
      }

      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          ...(businessId ? { business_id: businessId } : {}),
          payment_method: payment,
          total: item.price * item.quantity,
          staff_name: staff.name,
          product_id: item.productId,
        })
        .select("id")
        .single();

      if (saleError || !sale) {
        console.error("Sale insert failed:", saleError);
        return jsonError("Unable to save sale", 500);
      }

      saleIds.push(sale.id);

      const { error: stockError } = await supabase
        .from("products")
        .update({ stock: currentStock - item.quantity })
        .eq("id", item.productId);

      if (stockError) {
        console.error("Stock update failed:", stockError);
        return jsonError("Unable to update stock", 500);
      }
    }

    return NextResponse.json({ saleIds });
  } catch (error) {
    if (error instanceof AuthError || error instanceof RequestBodyError) {
      return jsonError(error.message, error.status);
    }

    console.error("Sale failed:", error);
    return jsonError("Unable to process sale", 500);
  }
}
