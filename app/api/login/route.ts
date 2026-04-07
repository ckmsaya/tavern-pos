import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const { pin } = await req.json();

  if (!pin) {
    return NextResponse.json({ error: "PIN required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: staff, error } = await supabase
    .rpc("verify_staff_pin", { input_pin: pin });

  if (error || !staff || staff.length === 0) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  const member = staff[0];

  const response = NextResponse.json({
    name: member.name,
    role: member.role,
  });

  response.cookies.set("staff_name", member.name, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
  });

  response.cookies.set("staff_role", member.role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
  });

  return response;
}