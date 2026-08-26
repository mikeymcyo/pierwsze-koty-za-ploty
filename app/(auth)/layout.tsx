import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-sunken">
      <header className="flex items-center justify-center px-5 pt-10 pb-8">
        <Link href="/" aria-label="SiteBoss Pro home">
          <Wordmark />
        </Link>
      </header>

      <main className="flex-1 px-5 pb-16">
        <div className="mx-auto w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
