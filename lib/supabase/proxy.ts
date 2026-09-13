import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import type { Database } from "@/types/database";

/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.includes(pathname);
}

/**
 * Who the request's token says it is, or null.
 *
 * getClaims verifies the ES256 signature with WebCrypto against the JWKS it
 * caches per process. Should that verification be unavailable for any reason
 * other than a bad or absent token - the key set could not be fetched, say -
 * the auth server is asked directly, as it used to be on every request, so
 * nobody is signed out by an outage that getUser would have survived.
 */
async function verifiedUser(
  supabase: ReturnType<typeof createServerClient<Database>>,
): Promise<{ id: string } | null> {
  try {
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims.sub;
    return typeof sub === "string" && sub ? { id: sub } : null;
  } catch {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ? { id: user.id } : null;
  }
}

/**
 * Refreshes the Supabase session on every request and gates private routes.
 *
 * The response object must be the one returned to the framework: token refreshes
 * are written to it as cookies, and dropping it silently logs users out.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Responses that set auth cookies must never be cached by a CDN.
        for (const [key, headerValue] of Object.entries(headers)) {
          response.headers.set(key, headerValue);
        }
      },
    },
  });

  // Verifies the token's signature locally against the project's signing
  // keys (fetched once and cached for the life of the instance), refreshing
  // it first when it has expired. Do not replace with getSession(): that
  // reads the cookie without verifying it. getUser() stood here before and
  // was a round trip to the auth server on every request - including the
  // dozen link prefetches every screen fires - measured at 40 ms warm and
  // 300-750 ms when those prefetches queued up behind one another.
  const user = await verifiedUser(supabase);

  const { pathname, search } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.search = "";
    // Send the user back where they were headed once they have signed in.
    redirect.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(redirect);
  }

  // A signed-in user has no reason to see the marketing or auth screens.
  if (user && (pathname === "/" || pathname === "/login" || pathname === "/signup")) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/dashboard";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}
