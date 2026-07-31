import { createServiceSupabaseClient } from "@/lib/server-supabase";
import { ReportData } from "@/lib/daily-report-pdf";
import { getStaffSessionsReport } from "@/lib/staff-sessions";

export function todayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

export async function getTodayReportData(): Promise<ReportData> {
  const date = todayDateString();
  const supabase = createServiceSupabaseClient();

  const [
    { data: products, error: productsError },
    { data: sales, error: salesError },
    { data: cashCounts, error: cashCountsError },
    { data: undoLog, error: undoLogError },
  ] = await Promise.all([
    supabase.from("products").select("id, name, category, price, cost_price, opening_stock, stock"),
    supabase
      .from("sales")
      .select("total, payment_method, staff_name, created_at, product_id, quantity")
      .gte("created_at", date)
      .order("created_at", { ascending: true }),
    supabase
      .from("cash_counts")
      .select("created_at, staff_name, counted_amount, expected_cash, status, owner_amount")
      .gte("created_at", date)
      .order("created_at", { ascending: true }),
    supabase
      .from("undo_audit_log")
      .select("created_at, staff_name, undone_by, approved_by, total")
      .gte("created_at", date)
      .order("created_at", { ascending: true }),
  ]);

  if (productsError) throw productsError;
  if (salesError) throw salesError;
  if (cashCountsError) throw cashCountsError;
  if (undoLogError) throw undoLogError;

  const salesList = sales ?? [];
  const productList = products ?? [];

  let revenue = 0;
  let cash = 0;
  let card = 0;
  const staffTotals = new Map<string, number>();

  salesList.forEach((s) => {
    const total = Number(s.total) || 0;
    revenue += total;
    if (s.payment_method === "cash") cash += total;
    if (s.payment_method === "card") card += total;
    staffTotals.set(s.staff_name, (staffTotals.get(s.staff_name) ?? 0) + total);
  });

  const productsWithSold = productList.map((p) => {
    const opening = Number(p.opening_stock) || 0;
    const stock = Number(p.stock) || 0;
    return {
      name: p.name,
      category: p.category,
      price: Number(p.price) || 0,
      cost_price: Number(p.cost_price) || 0,
      opening_stock: opening,
      stock,
      sold: opening - stock,
    };
  });

  // Day-level profit must come from today's actual sales (matching revenue's
  // window), not from productsWithSold's opening_stock/stock delta above —
  // that reflects everything sold since a product was last restocked, which
  // can span multiple days and doesn't correspond to "today" at all.
  const profit = salesList.reduce((sum, s) => {
    const product = productList.find((p) => p.id === s.product_id);
    if (!product) return sum;
    return sum + (Number(s.total) || 0) - (Number(product.cost_price) || 0) * (Number(s.quantity) || 0);
  }, 0);

  const staffSessions = await getStaffSessionsReport(date);

  return {
    date,
    revenue,
    cash,
    card,
    profit,
    staff: Array.from(staffTotals.entries()).map(([name, total]) => ({ name, total })),
    products: productsWithSold,
    sales: salesList.map((s) => ({
      created_at: s.created_at,
      total: Number(s.total) || 0,
      payment_method: s.payment_method,
      staff_name: s.staff_name,
    })),
    staffSessions,
    cashCounts: (cashCounts ?? []).map((c) => ({
      created_at: c.created_at,
      staff_name: c.staff_name,
      counted_amount: Number(c.counted_amount) || 0,
      expected_cash: Number(c.expected_cash) || 0,
      status: c.status,
      owner_amount: c.owner_amount === null ? null : Number(c.owner_amount) || 0,
    })),
    undoLog: (undoLog ?? []).map((u) => ({
      created_at: u.created_at,
      staff_name: u.staff_name,
      undone_by: u.undone_by,
      approved_by: u.approved_by,
      total: Number(u.total) || 0,
    })),
  };
}
