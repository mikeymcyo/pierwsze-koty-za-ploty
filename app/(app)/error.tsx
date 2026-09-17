"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * The signed-in shell's own boundary.
 *
 * A render error inside a page used to reach the root boundary and replace
 * the whole application, navigation and all. This one keeps the shell and
 * replaces only the page. It is a backstop: the forms on report screens no
 * longer throw on a failed request at all (lib/actions/recover.ts), and
 * nothing here is relied on to keep what somebody typed.
 */
export default function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("SiteBoss Pro page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight text-ink">This screen could not be shown</h1>
      <Alert tone="danger">{error.message || "An unexpected error occurred."}</Alert>
      {error.digest ? (
        <p className="font-mono text-xs text-ink-subtle">Reference: {error.digest}</p>
      ) : null}
      <Button onClick={reset} className="self-start">
        <RotateCcw aria-hidden />
        Try again
      </Button>
    </div>
  );
}
