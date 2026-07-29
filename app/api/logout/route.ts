import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/server-supabase";

export async function POST(req: NextRequest) {
  const staffName = req.cookies.get("staff_name")?.value;

  if (staffName) {
    try {
      const supabase = createServiceSupabaseClient();
      await supabase
        .from("staff_sessions")
        .update({ logout_at: new Date().toISOString() })
        .eq("staff_name", staffName)
        .is("logout_at", null);
    } catch (error) {
      console.error("Staff session close failed:", error);
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete("staff_name");
  response.cookies.delete("staff_role");
  return response;
}
