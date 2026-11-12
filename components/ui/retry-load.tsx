"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Fetch fresh server content without losing other client-side form state. */
export function RetryLoad() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      className="self-start"
      disabled={pending}
      aria-busy={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RotateCcw aria-hidden />
      {pending ? "Loading…" : "Reload screen"}
    </Button>
  );
}
