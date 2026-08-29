import { cn } from "@/lib/utils";

/**
 * The SiteBoss mark: SB on charcoal, with the three angled bars.
 *
 * Drawn rather than set in a font. A logo that depends on a webfont arriving
 * is a logo that is sometimes the wrong shape, and this one has to read
 * identically in the app, on a home screen and in a browser tab.
 *
 * The S is white and the B is gold, which is what keeps it reading as SB
 * rather than S3: the two letters are told apart by colour as well as by
 * shape, and the B keeps its full flat spine and two square bowls.
 */
export function Monogram({
  className,
  title = "SiteBoss Pro",
  plate = true,
}: {
  className?: string;
  title?: string;
  /** The charcoal tile behind the letters. Off for a mark on its own ground. */
  plate?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 128 128"
      role="img"
      aria-label={title}
      className={cn("block", className)}
    >
      {plate ? <rect width="128" height="128" rx="28" fill="#0d0f12" /> : null}

      {/* S - an angular block letter, cut on the diagonal top-right and
          bottom-left the way the mark is drawn. On the charcoal plate it is
          white; standing on the page it follows the ink, so the mark is dark-S
          on white in light mode exactly as the brand sheet draws it. */}
      <path
        fill={plate ? "#ffffff" : "var(--color-ink, #ffffff)"}
        d="M62 26H36c-9.4 0-17 7.6-17 17v6c0 8.3 5.9 15.4 14.1 16.8L52 68.7c2.3.4 4 2.4 4 4.8 0 2.7-2.2 4.9-4.9 4.9H21v14h30.1c10.4 0 18.9-8.5 18.9-18.9 0-9.1-6.5-16.9-15.4-18.5L36 52.1c-2.3-.4-4-2.4-4-4.8V45c0-2.8 2.2-5 5-5h25v-14z"
      />

      {/* B - flat spine, two square bowls, gold. */}
      <path
        fill="#ffc107"
        d="M74 26h24c9.9 0 18 8.1 18 18 0 5.2-2.2 9.9-5.8 13.2 4.8 3.3 7.8 8.8 7.8 15 0 10.4-8.5 18.8-18.9 18.8H74V26zm14 14v11h10c3 0 5.5-2.5 5.5-5.5S101 40 98 40H88zm0 25v13h11c3.6 0 6.5-2.9 6.5-6.5S102.6 65 99 65H88z"
      />

      {/* The three bars. Gold, and set below the letters as an accent. */}
      <g fill="#ffc107">
        <path d="M21 100h18l-7 12H14z" />
        <path d="M45 100h18l-7 12H38z" />
        <path d="M69 100h18l-7 12H62z" />
      </g>
    </svg>
  );
}
