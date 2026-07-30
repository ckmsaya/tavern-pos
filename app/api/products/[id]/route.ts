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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const limit = rateLimit(clientKey(req, "product-delete"), {
    limit: 30,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    requireOwner(req);

    const { id } = await context.params;
    const productId = id.trim();

    if (!UUID_RE.test(productId)) {
      return jsonError("Invalid product id");
    }

    const supabase = createServiceSupabaseClient();
    const { error } = await supabase.from("products").delete().eq("id", productId);

    if (error) {
      console.error("Product delete failed:", error);
      return jsonError("Unable to remove product", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.status);
    }

    console.error("Product delete failed:", error);
    return jsonError("Unable to remove product", 500);
  }
}
