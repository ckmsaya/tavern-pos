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
  ownerPin?: unknown;
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

  // Separate, stricter limit on the owner-PIN check itself, matching the
  // login route's pattern — this endpoint is a second PIN-brute-force
  // surface now that it accepts one.
  const pinLimit = rateLimit(clientKey(req, "sales-undo-pin"), {
    limit: 5,
    windowMs: 5 * 60 * 1000,
  });

  if (pinLimit.limited) {
    return rateLimitResponse(pinLimit.retryAfter);
  }

  try {
    const staff = requireStaffSession(req);

    const body = await parseJsonBody<UndoBody>(req, 4096);
    const saleIds = Array.isArray(body.saleIds)
      ? body.saleIds.filter((id): id is string => typeof id === "string" && UUID_RE.test(id)).slice(0, 50)
      : [];
    const ownerPin = typeof body.ownerPin === "string" ? body.ownerPin.trim() : "";

    if (!saleIds.length) {
      return jsonError("No valid sale ids provided");
    }

    if (!/^\d{4,12}$/.test(ownerPin)) {
      return jsonError("Owner PIN required", 403);
    }

    const supabase = createServiceSupabaseClient();

    const { data: ownerMatch, error: pinError } = await supabase
      .rpc("verify_staff_pin", { input_pin: ownerPin, input_business_id: null });

    if (pinError || !ownerMatch || ownerMatch.length === 0 || ownerMatch[0].role !== "owner") {
      return jsonError("Invalid owner PIN", 403);
    }

    const approvedBy = ownerMatch[0].name;

    const { data: sales, error: fetchError } = await supabase
      .from("sales")
      .select("id, product_id, quantity, total, staff_name")
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

    if (sales?.length) {
      const { error: auditError } = await supabase.from("undo_audit_log").insert(
        sales.map((sale) => ({
          sale_id: sale.id,
          product_id: sale.product_id,
          quantity: sale.quantity,
          total: sale.total,
          staff_name: sale.staff_name,
          undone_by: staff.name,
          approved_by: approvedBy,
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
