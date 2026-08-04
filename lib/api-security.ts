import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientKey(req: NextRequest, scope: string) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  return `${scope}:${forwarded || realIp || "unknown"}`;
}

export function rateLimit(key: string, options: RateLimitOptions) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { limited: false, retryAfter: options.windowMs };
  }

  current.count += 1;

  if (current.count > options.limit) {
    return { limited: true, retryAfter: current.resetAt - now };
  }

  return { limited: false, retryAfter: current.resetAt - now };
}

export function rateLimitResponse(retryAfterMs: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": Math.ceil(retryAfterMs / 1000).toString(),
      },
    }
  );
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export type SessionStaff = { name: string; role: "owner" | "staff" };

// Cookie values are fully client-controlled — a request can carry any
// Cookie header it likes, browser or not. So the only thing an API route
// may trust is the opaque session token, resolved against the
// server-side staff_sessions table (and the staff table, for the
// up-to-date role). See login/route.ts for how the token is issued.
export async function requireStaffSession(req: NextRequest): Promise<SessionStaff> {
  const token = req.cookies.get("session_token")?.value;

  if (!token) {
    throw new AuthError("Login required", 401);
  }

  const supabase = createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { data: session } = await supabase
    .from("staff_sessions")
    .select("staff_name")
    .eq("token", token)
    .is("logout_at", null)
    .maybeSingle();

  if (!session) {
    throw new AuthError("Login required", 401);
  }

  const { data: staff } = await supabase
    .from("staff")
    .select("name, role")
    .eq("name", session.staff_name)
    .maybeSingle();

  if (!staff) {
    throw new AuthError("Login required", 401);
  }

  return {
    name: staff.name,
    role: staff.role === "owner" ? "owner" : "staff",
  };
}

export async function requireOwner(req: NextRequest): Promise<SessionStaff> {
  const staff = await requireStaffSession(req);

  if (staff.role !== "owner") {
    throw new AuthError("Owner access required", 403);
  }

  return staff;
}

export async function parseJsonBody<T>(req: NextRequest, maxBytes: number): Promise<T> {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > maxBytes) {
    throw new RequestBodyError("Request body is too large", 413);
  }

  try {
    return (await req.json()) as T;
  } catch {
    throw new RequestBodyError("Invalid JSON body", 400);
  }
}

export class RequestBodyError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
