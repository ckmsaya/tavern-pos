import Twilio from "twilio";
import { getRequiredEnv } from "@/lib/api-security";

const WHATSAPP_FROM = "whatsapp:+14155238886";
const WHATSAPP_TO   = "whatsapp:+27765601400";

export async function sendWhatsAppMessage(options: { body: string; mediaUrl?: string[] }) {
  const client = Twilio(
    getRequiredEnv("TWILIO_ACCOUNT_SID"),
    getRequiredEnv("TWILIO_AUTH_TOKEN")
  );

  return client.messages.create({
    from: WHATSAPP_FROM,
    to: WHATSAPP_TO,
    body: options.body,
    ...(options.mediaUrl ? { mediaUrl: options.mediaUrl } : {}),
  });
}
