import { NextResponse, type NextRequest } from "next/server";

import { hasSupabaseConfig } from "@/lib/env";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Without credentials there is no session to refresh; let the request through
  // so the app can render its setup instructions instead of erroring.
  if (!hasSupabaseConfig()) {
    return NextResponse.next({ request });
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
