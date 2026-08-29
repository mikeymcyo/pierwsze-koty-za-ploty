import { Monogram } from "@/components/brand/monogram";
import { cn } from "@/lib/utils";

type WordmarkProps = {
  className?: string;
  /** Renders the mark only, for tight spaces like the top bar on small phones. */
  markOnly?: boolean;
  /** Larger, with the strapline. For the sign-in screen. */
  size?: "sm" | "lg";
};

/**
 * SiteBoss Pro, as it is signed.
 *
 * The mark and the name, with PRO set beneath in gold - the lock-up from the
 * brand sheet rather than three separate treatments across the application.
 */
export function Wordmark({ className, markOnly = false, size = "sm" }: WordmarkProps) {
  const large = size === "lg";

  return (
    <span className={cn("inline-flex items-center", large ? "gap-4" : "gap-2.5", className)}>
      <Monogram className={large ? "size-14" : "size-9"} plate={!large} />
      {markOnly ? (
        <span className="sr-only">SiteBoss Pro</span>
      ) : (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              "font-black tracking-tight text-ink",
              large ? "text-3xl" : "text-lg",
            )}
          >
            SITE<span className="text-brand">BOSS</span>
          </span>
          <span
            className={cn(
              "font-semibold tracking-[0.35em] text-ink-subtle",
              large ? "mt-1.5 text-xs" : "mt-0.5 text-[9px]",
            )}
          >
            PRO
          </span>
        </span>
      )}
    </span>
  );
}

/** The line under the name on the sign-in screen. */
export const STRAPLINE = "REPORT IT. PROVE IT. MOVE FORWARD.";
