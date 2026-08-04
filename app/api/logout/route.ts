import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/server-supabase";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;

  if (token) {
    try {
      const supabase = createServiceSupabaseClient();
      await supabase
        .from("staff_sessions")
        .update({ logout_at: new Date().toISOString() })
        .eq("token", token)
        .is("logout_at", null);
    } catch (error) {
      console.error("Staff session close failed:", error);
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete("session_token");
  return response;
}
