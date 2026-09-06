export default function Loading() {
  return (
    <div className="flex flex-col gap-5 animate-fade" aria-busy aria-label="Loading">
      <div className="h-8 w-44 animate-pulse rounded-xl bg-surface-muted/80" />
      <div className="h-28 animate-pulse rounded-card bg-surface" />
      <div className="h-24 animate-pulse rounded-card bg-surface" />
      <div className="h-24 animate-pulse rounded-card bg-surface" />
    </div>
  );
}
