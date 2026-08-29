import Link from "next/link";
import {
  AlertTriangle,
  ClipboardList,
  CircleCheck,
  FileText,
  Flag,
  History,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ACTIVITY_LABELS,
  ACTIVITY_TONES,
  groupActivity,
  type ActivityItem,
  type ActivityKind,
} from "@/lib/projects/activity";
import { cn, formatDate, formatTime, ukDay } from "@/lib/utils";

const ICONS: Record<ActivityKind, LucideIcon> = {
  survey: ClipboardList,
  daily: FileText,
  progress: TrendingUp,
  completion: Flag,
  issue_raised: AlertTriangle,
  issue_closed: CircleCheck,
};

/** The same tones the badges use, so a chip and its marker are one object. */
const MARKERS: Record<(typeof ACTIVITY_TONES)[ActivityKind], string> = {
  neutral: "border-line-strong bg-surface-muted text-ink-muted",
  info: "border-info/25 bg-info-soft text-info",
  success: "border-success/25 bg-success-soft text-success",
  warning: "border-warning/25 bg-warning-soft text-warning",
};

function heading(day: string): string {
  const today = ukDay(new Date().toISOString());
  if (day === today) return "Today";
  if (day === ukDay(new Date(Date.now() - 86_400_000).toISOString())) return "Yesterday";
  return formatDate(day) ?? day;
}

/**
 * What has happened on this job, newest first.
 *
 * Every row is a record that already exists and opens it, so the timeline is a
 * way through the project rather than a second account of it.
 *
 * Laid out for a phone held on site: one column, a rail down the left so the
 * order is obvious at a glance, days as headings so a scroll has landmarks,
 * and a whole row as the tap target.
 */
export function ProjectActivity({
  items,
  unavailable,
}: {
  items: readonly ActivityItem[];
  /** A source that would not load, named, rather than an error over the lot. */
  unavailable?: string | null;
}) {
  const days = groupActivity(items, (item) => ukDay(item.at));

  if (days.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        {unavailable ? <Unavailable what={unavailable} /> : null}
        <EmptyState
          icon={History}
          title="Nothing has happened yet"
          description="Surveys, reports and issues appear here as they are raised, newest first."
        />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      {unavailable ? <Unavailable what={unavailable} /> : null}

      {days.map((group) => (
        <div key={group.day} className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-ink-subtle uppercase">
            {heading(group.day)}
          </h2>

          <ol className="flex flex-col">
            {group.items.map((item, index) => {
              const Icon = ICONS[item.kind];
              const tone = ACTIVITY_TONES[item.kind];
              const last = index === group.items.length - 1;

              return (
                <li key={item.id} className={cn("relative flex gap-3", last ? null : "pb-3")}>
                  {/* The rail, drawn between one marker and the next rather
                      than behind them, so it never shows through. */}
                  {last ? null : (
                    <span
                      aria-hidden
                      className="absolute top-9 bottom-0 left-4 -ml-px w-0.5 rounded-full bg-line"
                    />
                  )}

                  <span
                    aria-hidden
                    className={cn(
                      "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border",
                      MARKERS[tone],
                    )}
                  >
                    <Icon className="size-4" />
                  </span>

                  <Link
                    href={item.href}
                    className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-surface-raised"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-semibold text-ink">{item.title}</p>
                      <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                        {formatTime(item.at)}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge tone={tone}>{ACTIVITY_LABELS[item.kind]}</Badge>
                      {item.detail ? (
                        <span className="min-w-0 text-sm text-ink-muted">{item.detail}</span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}

/** One line, not a page of error: the rest of the history is still worth reading. */
function Unavailable({ what }: { what: string }) {
  return (
    <p className="rounded-xl border border-line bg-surface-muted px-3 py-2 text-sm text-ink-muted">
      {what} could not be loaded, so they are missing from this list. Everything else here is
      complete.
    </p>
  );
}
