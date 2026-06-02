import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  clientKey,
  getRequiredEnv,
  jsonError,
  parseJsonBody,
  rateLimit,
  rateLimitResponse,
  RequestBodyError,
} from "@/lib/api-security";

type LoginBody = {
  pin?: unknown;
};

export async function POST(req: NextRequest) {
  const loginLimit = rateLimit(clientKey(req, "login"), {
    limit: 5,
    windowMs: 5 * 60 * 1000,
  });

  if (loginLimit.limited) {
    return rateLimitResponse(loginLimit.retryAfter);
  }

  try {
    const { pin } = await parseJsonBody<LoginBody>(req, 1024);
    const normalizedPin = typeof pin === "string" ? pin.trim() : "";

    if (!/^\d{4,12}$/.test(normalizedPin)) {
      return jsonError("Invalid PIN", 401);
    }

    const supabase = createClient(
      getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY")
    );

    const { data: staff, error } = await supabase
      .rpc("verify_staff_pin", { input_pin: normalizedPin });

    if (error || !staff || staff.length === 0) {
      return jsonError("Invalid PIN", 401);
    }

    const member = staff[0];
    const role = member.role === "owner" ? "owner" : "staff";
    const response = NextResponse.json({
      name: member.name,
      role,
    });

    response.cookies.set("staff_name", member.name, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    response.cookies.set("staff_role", role, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    return response;
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return jsonError(error.message, error.status);
    }

    console.error("Login failed:", error);
    return jsonError("Unable to log in right now", 500);
  }
}
