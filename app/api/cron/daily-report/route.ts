import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getTodayReportData } from "@/lib/report-data";

export const maxDuration = 30;

function getBaseUrl() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return host ? `https://${host}` : "http://localhost:3000";
}

// Triggered by Vercel Cron (see vercel.json) once a day. Sends the day's
// PDF report as a WhatsApp document attachment, replacing the old
// per-product low-stock text alerts.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await getTodayReportData();
    const pdfUrl = `${getBaseUrl()}/api/cron/daily-report/pdf?token=${encodeURIComponent(cronSecret)}`;

    await sendWhatsAppMessage({
      body: `Tavern Daily Report — ${data.date}\nRevenue: R${data.revenue.toFixed(2)} | Profit: R${data.profit.toFixed(2)}`,
      mediaUrl: [pdfUrl],
    });

    return NextResponse.json({ success: true, date: data.date });
  } catch (error) {
    console.error("Cron daily report failed:", error);
    return NextResponse.json({ error: "Unable to send daily report" }, { status: 500 });
  }
}
