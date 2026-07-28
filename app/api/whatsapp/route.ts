import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  clientKey,
  jsonError,
  parseJsonBody,
  rateLimit,
  rateLimitResponse,
  requireOwner,
  RequestBodyError,
} from "@/lib/api-security";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

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
    requireOwner(req);

    const { message } = await parseJsonBody<WhatsAppBody>(req, 4096);
    const body = typeof message === "string" ? message.trim() : "";

    if (!body || body.length > 1000) {
      return jsonError("Message must be between 1 and 1000 characters");
    }

    await sendWhatsAppMessage({ body });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError || error instanceof RequestBodyError) {
      return jsonError(error.message, error.status);
    }

    console.error("WhatsApp send failed:", error);
    return jsonError("Unable to send WhatsApp alert", 500);
  }
}
