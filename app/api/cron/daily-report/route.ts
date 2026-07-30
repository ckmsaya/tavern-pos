import { NextRequest, NextResponse } from "next/server";
import { buildDailyReportPDF } from "@/lib/daily-report-pdf";
import { getTodayReportData } from "@/lib/report-data";
import { sendDailyReportEmail } from "@/lib/gmail";

export const maxDuration = 30;

// Triggered by Vercel Cron (see vercel.json) once a day. Emails the day's
// PDF report via Gmail, replacing the old Twilio WhatsApp delivery.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await getTodayReportData();
    const pdf = await buildDailyReportPDF(data);

    await sendDailyReportEmail({
      date: data.date,
      revenue: data.revenue,
      profit: data.profit,
      pdf,
    });

    return NextResponse.json({ success: true, date: data.date });
  } catch (error) {
    console.error("Cron daily report failed:", error);
    return NextResponse.json({ error: "Unable to send daily report" }, { status: 500 });
  }
}
