"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { Wordmark } from "@/components/brand/wordmark";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced rather than swallowed, so failures are visible in the console too.
    console.error("SiteBoss Pro error:", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-5">
      <Wordmark />

      <div className="flex w-full max-w-md flex-col gap-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Something broke</h1>

        <Alert tone="danger" className="text-left">
          {error.message || "An unexpected error occurred."}
        </Alert>

        {error.digest ? (
          <p className="font-mono text-xs text-ink-subtle">Reference: {error.digest}</p>
        ) : null}

        <Button onClick={reset} className="self-center">
          <RotateCcw aria-hidden />
          Try again
        </Button>
      </div>
    </div>
  );
}
