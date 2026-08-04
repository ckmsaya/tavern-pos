import { NextRequest, NextResponse } from "next/server";
import { AuthError, jsonError, requireStaffSession } from "@/lib/api-security";
import { createServiceSupabaseClient } from "@/lib/server-supabase";

export async function GET(req: NextRequest) {
  try {
    const { name, role } = await requireStaffSession(req);

    let loginAt: string | null = null;

    try {
      const supabase = createServiceSupabaseClient();
      const { data } = await supabase
        .from("staff_sessions")
        .select("login_at")
        .eq("staff_name", name)
        .is("logout_at", null)
        .order("login_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      loginAt = data?.login_at ?? null;
    } catch (error) {
      console.error("Session lookup failed:", error);
    }

    return NextResponse.json({ name, role, loginAt });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.status);
    }

    console.error("Me lookup failed:", error);
    return jsonError("Not logged in", 401);
  }
}
