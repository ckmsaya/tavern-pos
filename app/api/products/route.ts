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

type ProductBody = {
  name?: unknown;
  barcode?: unknown;
  category?: unknown;
  price?: unknown;
  cost_price?: unknown;
};

const categories = new Set(["beer", "cider", "spirit", "wine", "food", "other"]);

function text(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "product-create"), {
    limit: 30,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    requireOwner(req);

    const body = await parseJsonBody<ProductBody>(req, 4096);
    const name = text(body.name);
    const barcode = text(body.barcode, 80);
    const category = categories.has(text(body.category, 40)) ? text(body.category, 40) : "other";
    const price = money(body.price);
    const costPrice = money(body.cost_price);

    if (!name || !barcode || price === null || costPrice === null) {
      return jsonError("Product name, barcode, price, and cost price are required");
    }

    const supabase = createServiceSupabaseClient();
    const { data: existing, error: lookupError } = await supabase
      .from("products")
      .select("id")
      .eq("barcode", barcode)
      .maybeSingle();

    if (lookupError) {
      console.error("Product lookup failed:", lookupError);
      return jsonError("Unable to check product barcode", 500);
    }

    if (existing) {
      return jsonError("Product with this barcode already exists", 409);
    }

    const { data: product, error } = await supabase
      .from("products")
      .insert({
        name,
        category,
        price,
        cost_price: costPrice,
        stock: 0,
        opening_stock: 0,
        barcode,
      })
      .select()
      .single();

    if (error) {
      console.error("Product create failed:", error);
      return jsonError("Unable to add product", 500);
    }

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError || error instanceof RequestBodyError) {
      return jsonError(error.message, error.status);
    }

    console.error("Product create failed:", error);
    return jsonError("Unable to add product", 500);
  }
}
