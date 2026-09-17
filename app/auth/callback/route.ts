import { NextResponse, type NextRequest } from "next/server";

import { safeReturnPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Lands the email links Supabase sends — confirmation and password reset.
 * Exchanges the one-time code for a session, then forwards the user on.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const errorDescription = searchParams.get("error_description");
  const next = searchParams.get("next");
  // Same rule as the login form: one leading slash, no backslash, no scheme.
  const destination = safeReturnPath(next) ?? "/dashboard";

  if (errorDescription) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", errorDescription);
    return NextResponse.redirect(url);
  }

  if (!code) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", "That link is missing its sign-in code.");
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const url = new URL("/login", origin);
    url.searchParams.set(
      "error",
      "That link has expired or has already been used. Please request a new one.",
    );
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL(destination, origin));
}
