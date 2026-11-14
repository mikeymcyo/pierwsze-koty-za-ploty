import Link from "next/link";

import { STRAPLINE, Wordmark } from "@/components/brand/wordmark";

/**
 * The way into SiteBoss.
 *
 * The first thing anybody sees of this product, so it is signed properly: the
 * mark, the name, and the line the company stands behind - on charcoal, with a
 * single gold rule. The screen holds one card and nothing else, because
 * somebody standing in a site cabin needs to find the password field, not
 * admire the page.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-entry">
      <header>
        <Link href="/" aria-label="SiteBoss Pro home"><Wordmark /></Link>
        <p>{STRAPLINE}</p>
      </header>
      <main>{children}</main>
    </div>
  );
}
