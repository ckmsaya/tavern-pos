import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const name = cookieStore.get("staff_name")?.value;
  const role = cookieStore.get("staff_role")?.value;

  if (!name) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  return NextResponse.json({ name, role });
}