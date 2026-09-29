import { NextResponse, type NextRequest } from "next/server";

/**
 * Password-protects the whole app (pages and the server actions that read/write the database)
 * with the browser's built-in login prompt, using APP_USERNAME / APP_PASSWORD.
 *
 * - Locally with no APP_PASSWORD set: open, for development.
 * - In production with no APP_PASSWORD set: refuses every request, so a deploy can never be
 *   accidentally public.
 */
export function middleware(req: NextRequest) {
  const username = process.env.APP_USERNAME || "baliraja";
  const password = process.env.APP_PASSWORD;

  if (!password) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("APP_PASSWORD is not set on the server, so the app is locked. Set it in the hosting dashboard.", {
        status: 503,
      });
    }
    return NextResponse.next();
  }

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const [user, ...rest] = atob(header.slice(6)).split(":");
    if (safeEqual(user, username) && safeEqual(rest.join(":"), password)) return NextResponse.next();
  }

  return new NextResponse("Login required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Baliraja Farm Fresh", charset="UTF-8"' },
  });
}

/** Compares without stopping at the first different character, so timing doesn't leak how much matched. */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const config = {
  // Everything except the health check (for Render), Next's static files and the icons.
  matcher: ["/((?!api/health|_next/static|_next/image|icon.jpg|apple-icon.jpg|brand/).*)"],
};
