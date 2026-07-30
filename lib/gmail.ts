import nodemailer from "nodemailer";
import { getRequiredEnv } from "@/lib/api-security";

export async function sendDailyReportEmail(options: {
  date: string;
  revenue: number;
  profit: number;
  pdf: Buffer;
}) {
  const user = getRequiredEnv("GMAIL_USER");
  const appPassword = getRequiredEnv("GMAIL_APP_PASSWORD");
  const to = process.env.REPORT_TO_EMAIL || user;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: appPassword },
  });

  await transporter.sendMail({
    from: `"TillFlow POS" <${user}>`,
    to,
    subject: `Tavern Daily Report — ${options.date}`,
    text: `Attached is the daily business report for ${options.date}.\n\nRevenue: R${options.revenue.toFixed(2)}\nProfit: R${options.profit.toFixed(2)}\n\n— TillFlow POS`,
    attachments: [
      {
        filename: `tavern_report_${options.date}.pdf`,
        content: options.pdf,
        contentType: "application/pdf",
      },
    ],
  });
}
