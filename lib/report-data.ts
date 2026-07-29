import { createServiceSupabaseClient } from "@/lib/server-supabase";
import { ReportData } from "@/lib/daily-report-pdf";
import { getStaffSessionsReport } from "@/lib/staff-sessions";

export function todayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

export async function getTodayReportData(): Promise<ReportData> {
  const date = todayDateString();
  const supabase = createServiceSupabaseClient();

  const [{ data: products, error: productsError }, { data: sales, error: salesError }] = await Promise.all([
    supabase.from("products").select("name, category, price, cost_price, opening_stock, stock"),
    supabase
      .from("sales")
      .select("total, payment_method, staff_name, created_at")
      .gte("created_at", date)
      .order("created_at", { ascending: true }),
  ]);

  if (productsError) throw productsError;
  if (salesError) throw salesError;

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

  const profit = productsWithSold.reduce(
    (sum, p) => sum + p.sold * (p.price - p.cost_price),
    0
  );

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
  };
}
