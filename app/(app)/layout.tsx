import { Suspense } from "react";

import { BottomNav } from "@/components/nav/bottom-nav";
import { SideNav } from "@/components/nav/side-nav";
import { TopBar } from "@/components/nav/top-bar";
import { getSessionContext } from "@/lib/auth/session";

/**
 * The company chip in the phone's top bar - the one thing in the shell that
 * needs the session.
 *
 * Its own async component behind Suspense, so the shell is not held back by
 * it. The layout used to await the whole session before rendering anything,
 * which meant the navigation, the skeleton and the first paint all waited on
 * the auth server and two queries; now the shell streams at once, the page
 * streams in behind app/(app)/loading.tsx, and the chip fills in with them.
 */
async function CompanyChip() {
  const session = await getSessionContext();
  return <>{session?.companyName ?? ""}</>;
}

/**
 * Signed-in shell.
 *
 * Nothing here awaits. Access is decided before this renders - proxy.ts
 * sends a request with no user to /login before any page is reached - and
 * every page under it calls requireSessionContext for itself, so a screen
 * that somehow rendered without a session would still redirect. What the
 * layout gives up is only the wait: the frame of the app appears on the
 * first byte, and the content follows.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-surface-sunken">
      <SideNav />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          companyName={
            <Suspense fallback={null}>
              <CompanyChip />
            </Suspense>
          }
        />

        {/* Bottom padding clears the floating mobile nav bar. */}
        <main className="flex-1 px-4 pt-5 pb-32 md:px-8 md:pt-8 md:pb-10">
          {/* Opacity only, never a transform: the PDF viewer inside is
              position: fixed, and a transformed ancestor becomes its
              containing block - on iOS Safari for good, which collapsed the
              viewer to a strip at the top of the screen. */}
          <div className="mx-auto w-full max-w-3xl animate-fade">{children}</div>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
