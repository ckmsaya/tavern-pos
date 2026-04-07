import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("staff_name");
  response.cookies.delete("staff_role");
  return response;
}