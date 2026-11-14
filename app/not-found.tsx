import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-5 text-center">
      <Wordmark />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Page not found</h1>
        <p className="text-ink-muted">
          That link doesn&rsquo;t lead anywhere in SiteBoss Pro.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
