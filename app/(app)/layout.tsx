import { BottomNav } from "@/components/nav/bottom-nav";
import { SideNav } from "@/components/nav/side-nav";
import { TopBar } from "@/components/nav/top-bar";
import { requireSessionContext } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSessionContext();

  return (
    <div className="flex min-h-dvh bg-surface-sunken">
      <SideNav />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar companyName={session.companyName} />

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
