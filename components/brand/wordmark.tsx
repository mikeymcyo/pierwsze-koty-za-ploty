import { cn } from "@/lib/utils";

type WordmarkProps = {
  className?: string;
  /** Renders the mark only, for tight spaces like the top bar on small phones. */
  markOnly?: boolean;
};

/**
 * SiteBoss Pro wordmark. Text-based by design — a square amber mark carrying
 * "SB", followed by the name. No image asset, so it stays crisp everywhere.
 */
export function Wordmark({ className, markOnly = false }: WordmarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-lg bg-brand text-[13px] leading-none font-black tracking-tight text-ink"
      >
        SB
      </span>
      {markOnly ? (
        <span className="sr-only">SiteBoss Pro</span>
      ) : (
        <span className="text-lg leading-none font-bold tracking-tight text-ink">
          SiteBoss
          <span className="ml-1 font-semibold text-ink-subtle">Pro</span>
        </span>
      )}
    </span>
  );
}
