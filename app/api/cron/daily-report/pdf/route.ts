import { NextRequest, NextResponse } from "next/server";
import { buildDailyReportPDF } from "@/lib/daily-report-pdf";
import { getTodayReportData } from "@/lib/report-data";

export const maxDuration = 30;

// Regenerates today's report PDF on demand. This exists so Twilio's WhatsApp
// media fetch (which requires a plain fetchable URL, not a buffer) has
// something to download; it re-runs the same aggregation as the cron
// trigger rather than requiring shared storage between the two requests.
// Twilio's fetch carries no custom headers/cookies, so access is gated by a
// token query param instead of the usual cookie-based auth.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await getTodayReportData();
    const pdf = await buildDailyReportPDF(data);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="tavern_report_${data.date}.pdf"`,
        "Content-Length": pdf.length.toString(),
      },
    });
  } catch (error) {
    console.error("Cron report PDF generation failed:", error);
    return NextResponse.json({ error: "Unable to generate report" }, { status: 500 });
  }
}
