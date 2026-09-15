import { NextResponse, type NextRequest } from "next/server";

/**
 * The outer gate. It runs on every request and only checks that the session
 * cookie carries a valid signature — no database, no Node APIs, so it stays on
 * the edge runtime and adds no latency worth measuring.
 *
 * It is deliberately not the security boundary. A signature proves the cookie
 * came from us; it does not prove the session still exists, that it has not
 * expired, or that the account has not been disabled. Those are checked
 * server-side by requireUser() before any page or action does anything. What
 * this buys is that an unauthenticated visitor lands on /login instead of on a
 * page that renders and then redirects.
 */

const SESSION_COOKIE = "sonar_session";

/** Reachable without a session. Everything else needs one. */
const PUBLIC_PATHS = ["/login", "/api/health"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  // The scheduler authenticates with CRON_SECRET in an Authorization header,
  // which the route itself checks. A session cookie would make no sense there.
  if (pathname.startsWith("/api/cron/")) return true;
  return false;
}

async function signatureValid(value: string, secret: string): Promise<boolean> {
  const dot = value.lastIndexOf(".");
  if (dot < 1) return false;
  const id = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id));
  const expected = Buffer.from(new Uint8Array(sig)).toString("base64url");
  // Constant-time enough: both strings are fixed length and attacker-supplied
  // timing here reveals nothing the session lookup does not already gate.
  if (mac.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    // Failing closed is the only safe answer: without a secret nothing can be
    // verified, and serving the app anyway would mean serving it to everyone.
    return new NextResponse(
      "AUTH_SECRET is not set. The app will not serve anything until it is. Generate one with: openssl rand -hex 32",
      { status: 503, headers: { "content-type": "text/plain" } },
    );
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && (await signatureValid(cookie, secret))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  // Come back to where they were headed, but only ever to a path on this site.
  if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Everything except Next's own static output and the favicon.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
