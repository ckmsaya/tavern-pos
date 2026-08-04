import { NextResponse, type NextRequest } from "next/server";

// This only gates on whether a session cookie is present, not what role it
// carries — the cookie is an opaque token now (see lib/api-security.ts),
// and middleware has no business resolving it against the database on
// every navigation. The owner-vs-staff distinction is enforced for real by
// requireOwner() on each API route, and mirrored client-side (see
// dashboard/page.tsx's init(), which redirects non-owners to /pos after
// checking the server-validated role from /api/me).
export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get("session_token")?.value);
  const path = request.nextUrl.pathname;

  if (!hasSession && !path.startsWith("/login")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (hasSession && path.startsWith("/login")) {
    return NextResponse.redirect(new URL("/pos", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/pos/:path*", "/login"],
};