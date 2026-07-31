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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req, "sales-undo"), {
    limit: 30,
    windowMs: 60 * 1000,
  });

  if (limit.limited) {
    return rateLimitResponse(limit.retryAfter);
  }

  try {
    const staff = requireStaffSession(req);

    const body = await parseJsonBody<UndoBody>(req, 4096);
    const saleIds = Array.isArray(body.saleIds)
      ? body.saleIds.filter((id): id is string => typeof id === "string" && UUID_RE.test(id)).slice(0, 50)
      : [];

    if (!saleIds.length) {
      return jsonError("No valid sale ids provided");
    }

    const supabase = createServiceSupabaseClient();

    const { data: sales, error: fetchError } = await supabase
      .from("sales")
      .select("id, product_id, quantity, total, staff_name")
      .in("id", saleIds);

    if (fetchError) {
      console.error("Undo lookup failed:", fetchError);
      return jsonError("Unable to undo sale", 500);
    }

    // Without an owner PIN gate, this is the one real-time guard left: a
    // regular staff member may only undo their own sales. Owners can still
    // undo anyone's — the undo_audit_log below is what keeps everything
    // accountable after the fact.
    if (staff.role !== "owner") {
      const foreign = (sales ?? []).some((sale) => sale.staff_name !== staff.name);
      if (foreign) {
        return jsonError("You can only undo your own sales", 403);
      }
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

    if (sales?.length) {
      const { error: auditError } = await supabase.from("undo_audit_log").insert(
        sales.map((sale) => ({
          sale_id: sale.id,
          product_id: sale.product_id,
          quantity: sale.quantity,
          total: sale.total,
          staff_name: sale.staff_name,
          undone_by: staff.name,
          approved_by: null,
        }))
      );

      if (auditError) {
        console.error("Undo audit log insert failed:", auditError);
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
