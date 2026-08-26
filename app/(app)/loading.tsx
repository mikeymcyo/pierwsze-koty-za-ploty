export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-muted" />
      <div className="h-24 animate-pulse rounded-2xl bg-surface-muted" />
      <div className="h-24 animate-pulse rounded-2xl bg-surface-muted" />
    </div>
  );
}
