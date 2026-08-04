import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
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
  businessId?: unknown;
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
    const { pin, businessId } = await parseJsonBody<LoginBody>(req, 1024);
    const normalizedPin = typeof pin === "string" ? pin.trim() : "";
    const normalizedBusinessId = typeof businessId === "string" && businessId.trim()
      ? businessId.trim()
      : null;

    if (!/^\d{4,12}$/.test(normalizedPin)) {
      return jsonError("Invalid PIN", 401);
    }

    const supabase = createClient(
      getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY")
    );

    const { data: staff, error } = await supabase
      .rpc("verify_staff_pin", { input_pin: normalizedPin, input_business_id: normalizedBusinessId });

    if (error || !staff || staff.length === 0) {
      return jsonError("Invalid PIN", 401);
    }

    const member = staff[0];
    const role = member.role === "owner" ? "owner" : "staff";

    // Close any dangling open sessions for this staff member (e.g. they
    // closed the browser without logging out last time) so hours-worked
    // figures don't grow unbounded, then start a fresh session.
    await supabase
      .from("staff_sessions")
      .update({ logout_at: new Date().toISOString() })
      .eq("staff_name", member.name)
      .is("logout_at", null);

    // Session identity lives server-side, keyed by this unguessable token —
    // the client only ever holds the token, never the name/role directly,
    // so it can't forge owner access by editing its cookies.
    const token = randomBytes(32).toString("hex");

    const { error: sessionError } = await supabase
      .from("staff_sessions")
      .insert({ staff_name: member.name, token });

    if (sessionError) {
      console.error("Staff session start failed:", sessionError);
      return jsonError("Unable to log in right now", 500);
    }

    const response = NextResponse.json({
      name: member.name,
      role,
    });

    response.cookies.set("session_token", token, {
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
