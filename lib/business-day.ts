// The tavern runs on South Africa Standard Time (UTC+2, no DST — the
// offset never changes across the year), but plain JS Date/toISOString()
// always works in UTC. Every "today" boundary in this app — dashboard
// KPIs, the emailed daily report, reset-day, cash-count reconciliation
// windows — needs to agree on the same calendar day the till is actually
// on, not the server's UTC day, or sales made in the first two hours
// after local midnight (22:00-23:59 UTC the day before) get silently
// attributed to the wrong day everywhere. This is the one place that
// offset is defined; nothing else in the app should compute "today" by
// hand with new Date().toISOString().split("T")[0].
//
// Safe to import from both client components and server route handlers —
// this file only touches Date, nothing environment-specific.
export const BUSINESS_TZ_OFFSET_MINUTES = 120; // SAST = UTC+2

// The business's current calendar date, e.g. "2026-08-05" — for display,
// and as an identifier when stepping through days (see addDaysToDateString).
// NOT safe to pass directly into a `created_at >= ...` query — Postgres
// interprets a bare date string as UTC midnight, two hours off from where
// the till's day actually starts. Use businessDayStartUTC for that.
export function businessDateString(date: Date = new Date()): string {
  return new Date(date.getTime() + BUSINESS_TZ_OFFSET_MINUTES * 60 * 1000)
    .toISOString()
    .split("T")[0];
}

// The UTC instant a given business calendar day begins — this is what
// should actually be passed as a query boundary.
export function businessDayStartUTC(dateStr: string): string {
  return new Date(
    new Date(`${dateStr}T00:00:00Z`).getTime() - BUSINESS_TZ_OFFSET_MINUTES * 60 * 1000
  ).toISOString();
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}
