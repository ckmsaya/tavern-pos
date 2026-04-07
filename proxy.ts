import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const role = request.cookies.get("staff_role")?.value;
  const path = request.nextUrl.pathname;

  // Not logged in
  if (!role && !path.startsWith("/login")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Staff trying to access owner routes
  if (role === "staff" && path.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/pos", request.url));
  }

  // Already logged in, don't show login
  if (role && path.startsWith("/login")) {
    return NextResponse.redirect(
      new URL(role === "owner" ? "/dashboard" : "/pos", request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/pos/:path*", "/login"],
};