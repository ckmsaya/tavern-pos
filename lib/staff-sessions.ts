import { createServiceSupabaseClient } from "@/lib/server-supabase";
import { ReportStaffSession } from "@/lib/daily-report-pdf";

export async function getStaffSessionsReport(since: string): Promise<ReportStaffSession[]> {
  const supabase = createServiceSupabaseClient();

  const { data: sessions, error } = await supabase
    .from("staff_sessions")
    .select("id, staff_name, login_at, logout_at")
    .gte("login_at", since)
    .order("login_at", { ascending: false });

  if (error) throw error;
  if (!sessions?.length) return [];

  const results: ReportStaffSession[] = [];

  for (const session of sessions) {
    const windowEnd = session.logout_at ?? new Date().toISOString();

    const { data: sales, error: salesError } = await supabase
      .from("sales")
      .select("total, quantity")
      .eq("staff_name", session.staff_name)
      .gte("created_at", session.login_at)
      .lte("created_at", windowEnd);

    if (salesError) throw salesError;

    const itemsSold = (sales ?? []).reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
    const moneyMade = (sales ?? []).reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const hoursWorked = (new Date(windowEnd).getTime() - new Date(session.login_at).getTime()) / (1000 * 60 * 60);

    const { data: cashCounts, error: cashCountsError } = await supabase
      .from("cash_counts")
      .select("counted_amount")
      .eq("staff_name", session.staff_name)
      .gte("created_at", session.login_at)
      .lte("created_at", windowEnd)
      .order("created_at", { ascending: false })
      .limit(1);

    if (cashCountsError) throw cashCountsError;

    const moneyCounted = cashCounts?.length ? Number(cashCounts[0].counted_amount) : null;

    results.push({
      staffName: session.staff_name,
      loginAt: session.login_at,
      logoutAt: session.logout_at,
      hoursWorked,
      itemsSold,
      moneyMade,
      moneyCounted,
    });
  }

  return results;
}
