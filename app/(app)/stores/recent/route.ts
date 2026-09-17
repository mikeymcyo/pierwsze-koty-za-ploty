import { NextResponse } from "next/server";

import { recordRecentLocation } from "@/lib/stores/recent-server";

/**
 * Records a store visit or a directions tap, from a beacon.
 *
 * A route rather than a server action because of what happens next: the
 * person has just tapped Waze, and the browser is handing the screen to
 * another app. A request started at that moment can be dropped with the
 * page. `navigator.sendBeacon` (with `fetch keepalive` behind it) is the
 * browser's promise to finish a small request through a page hide, and a
 * server action cannot be sent that way.
 *
 * The body carries only a directory id and a store code. Who visited comes
 * from the session cookie inside `recordRecentLocation`, never from the
 * body. The Origin header is checked against this host, so a page elsewhere
 * cannot write into somebody's history even if it could reach the route.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  let body: { directory?: unknown; code?: unknown } = {};
  try {
    body = (await request.json()) as { directory?: unknown; code?: unknown };
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  const outcome = await recordRecentLocation(body);
  if (!outcome.ok) {
    const status = outcome.reason === "failed" ? 500 : 400;
    return NextResponse.json(outcome, { status });
  }
  return NextResponse.json({ ok: true });
}
