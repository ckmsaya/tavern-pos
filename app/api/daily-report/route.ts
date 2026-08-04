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
import { buildDailyReportPDF, ReportData, ReportProduct, ReportStaff, ReportSale, ReportStaffSession, ReportCashCount, ReportUndoEntry } from "@/lib/daily-report-pdf";

function n(v: unknown): number { return Number(v) || 0; }

function text(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validateReportData(value: unknown): ReportData {
  if (!value || typeof value !== "object") {
    throw new RequestBodyError("Invalid report payload", 400);
  }

  const data = value as Partial<ReportData>;
  const products = Array.isArray(data.products) ? data.products.slice(0, 500) : [];
  const staff = Array.isArray(data.staff) ? data.staff.slice(0, 100) : [];
  const sales = Array.isArray(data.sales) ? data.sales.slice(0, 1000) : [];
  const staffSessions = Array.isArray(data.staffSessions) ? data.staffSessions.slice(0, 200) : [];
  const cashCounts = Array.isArray(data.cashCounts) ? data.cashCounts.slice(0, 200) : [];
  const undoLog = Array.isArray(data.undoLog) ? data.undoLog.slice(0, 200) : [];

  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(text(data.date, 10))
      ? text(data.date, 10)
      : new Date().toISOString().split("T")[0],
    revenue: n(data.revenue),
    cash: n(data.cash),
    card: n(data.card),
    profit: n(data.profit),
    staff: staff.map((item) => ({
      name: text((item as Partial<ReportStaff>).name),
      total: n((item as Partial<ReportStaff>).total),
    })),
    products: products.map((item) => {
      const product = item as Partial<ReportProduct>;
      return {
        name: text(product.name),
        category: text(product.category, 40),
        price: n(product.price),
        cost_price: n(product.cost_price),
        opening_stock: n(product.opening_stock),
        stock: n(product.stock),
        sold: n(product.sold),
      };
    }),
    sales: sales.map((item) => {
      const sale = item as Partial<ReportSale>;
      return {
        created_at: text(sale.created_at, 40),
        total: n(sale.total),
        payment_method: text(sale.payment_method, 20),
        staff_name: text(sale.staff_name),
      };
    }),
    staffSessions: staffSessions.map((item) => {
      const session = item as Partial<ReportStaffSession>;
      return {
        staffName: text(session.staffName),
        loginAt: text(session.loginAt, 40),
        logoutAt: session.logoutAt ? text(session.logoutAt, 40) : null,
        hoursWorked: n(session.hoursWorked),
        itemsSold: n(session.itemsSold),
        moneyMade: n(session.moneyMade),
        moneyCounted: session.moneyCounted === null || session.moneyCounted === undefined ? null : n(session.moneyCounted),
      };
    }),
    cashCounts: cashCounts.map((item) => {
      const count = item as Partial<ReportCashCount>;
      return {
        created_at: text(count.created_at, 40),
        staff_name: text(count.staff_name),
        counted_amount: n(count.counted_amount),
        expected_cash: n(count.expected_cash),
        status: text(count.status, 20) || "pending",
        owner_amount: count.owner_amount === null || count.owner_amount === undefined ? null : n(count.owner_amount),
      };
    }),
    undoLog: undoLog.map((item) => {
      const entry = item as Partial<ReportUndoEntry>;
      return {
        created_at: text(entry.created_at, 40),
        staff_name: text(entry.staff_name),
        undone_by: text(entry.undone_by),
        approved_by: text(entry.approved_by),
        total: n(entry.total),
      };
    }),
  };
}

export async function POST(req: NextRequest) {
  const reportLimit = rateLimit(clientKey(req, "daily-report"), {
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });

  if (reportLimit.limited) {
    return rateLimitResponse(reportLimit.retryAfter);
  }

  try {
    await requireOwner(req);

    const data = validateReportData(await parseJsonBody<unknown>(req, 256 * 1024));
    const pdf  = await buildDailyReportPDF(data);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="tavern_report_${data.date ?? "today"}.pdf"`,
        "Content-Length":      pdf.length.toString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthError || error instanceof RequestBodyError) {
      return jsonError(error.message, error.status);
    }

    console.error("Report error:", error);
    return jsonError("Unable to generate report", 500);
  }
}
