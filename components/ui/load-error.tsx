import { Alert } from "@/components/ui/alert";

/**
 * Shown in place of content that could not be loaded.
 *
 * A failed query is an ordinary state, not an unrenderable one. Throwing sends
 * the whole screen to the error boundary, which in production shows a minified
 * React error and a digest - a blank page and a number, from which nobody can
 * tell what went wrong or whether it was their fault.
 *
 * So the shell, the navigation and the heading stay put, and this says what
 * failed in plain words. The database's own error code comes with it: it is
 * short, it is not sensitive - PostgREST codes name a class of fault, not any
 * data - and it is the one thing that turns "it broke" into a diagnosis. The
 * error *message* is deliberately not shown; it is logged on the server by
 * instrumentation.ts instead.
 */
export function LoadError({
  what,
  code,
}: {
  /** What could not be loaded, as the user would say it: "your projects". */
  what: string;
  code?: string | null;
}) {
  return (
    <Alert tone="danger">
      {/* Alert lays its icon out beside this block, so the stacking goes here. */}
      <div className="flex flex-col gap-2">
        <p className="font-semibold">Could not load {what}.</p>
        <p className="font-normal">
          This is usually temporary. Reload the page, and if it keeps happening
          {code ? " quote the code below" : " let us know"} - it says why.
        </p>
        {code ? (
          <p className="font-mono text-xs">
            Code: <span className="font-semibold">{code}</span>
          </p>
        ) : null}
      </div>
    </Alert>
  );
}
