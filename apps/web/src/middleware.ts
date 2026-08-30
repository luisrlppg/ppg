import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "ppg_session";

export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has(COOKIE);
  const { pathname } = req.nextUrl;

  if (!hasSession && pathname === "/") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login"],
};