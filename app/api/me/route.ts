import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceSupabaseClient } from "@/lib/server-supabase";

export async function GET() {
  const cookieStore = await cookies();
  const name = cookieStore.get("staff_name")?.value;
  const role = cookieStore.get("staff_role")?.value;

  if (!name) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

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
}
