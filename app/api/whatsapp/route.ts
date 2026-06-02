import { NextRequest, NextResponse } from "next/server";
import Twilio from "twilio";
import {
  clientKey,
  getRequiredEnv,
  jsonError,
  parseJsonBody,
  rateLimit,
  rateLimitResponse,
  RequestBodyError,
} from "@/lib/api-security";

type WhatsAppBody = {
  message?: unknown;
};

export async function POST(req: NextRequest) {
  const sendLimit = rateLimit(clientKey(req, "whatsapp"), {
    limit: 20,
    windowMs: 60 * 1000,
  });

  if (sendLimit.limited) {
    return rateLimitResponse(sendLimit.retryAfter);
  }

  try {
    const { message } = await parseJsonBody<WhatsAppBody>(req, 4096);
    const body = typeof message === "string" ? message.trim() : "";

    if (!body || body.length > 1000) {
      return jsonError("Message must be between 1 and 1000 characters");
    }

    const client = Twilio(
      getRequiredEnv("TWILIO_ACCOUNT_SID"),
      getRequiredEnv("TWILIO_AUTH_TOKEN")
    );

    await client.messages.create({
      from: "whatsapp:+14155238886",
      to: "whatsapp:+27646261102",
      body,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return jsonError(error.message, error.status);
    }

    console.error("WhatsApp send failed:", error);
    return jsonError("Unable to send WhatsApp alert", 500);
  }
}
