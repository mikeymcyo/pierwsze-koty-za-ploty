import { NextResponse, type NextRequest } from "next/server";

import { hasSupabaseConfig } from "@/lib/env";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Without credentials there is no session to refresh, and any page that talks
  // to Supabase would throw. Send everything to the landing page, which explains
  // what to configure, rather than letting it fail with a 500.
  if (!hasSupabaseConfig()) {
    if (request.nextUrl.pathname === "/") {
      return NextResponse.next({ request });
    }
    const setup = request.nextUrl.clone();
    setup.pathname = "/";
    setup.search = "";
    return NextResponse.redirect(setup);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except Next.js internals and static assets. Auth cookies must
     * be refreshed on real page and API requests only.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
