"use client";

import { useActionState, useMemo } from "react";

import { recoverable } from "@/lib/actions/recover";

/**
 * `useActionState` for a form whose text must survive a bad request.
 *
 * Same tuple, same type arguments, same call. The only difference is that an
 * action which cannot be reached or throws resolves to `{ ...previous, error }`
 * instead of rejecting into an error boundary, so the form and everything
 * typed into it stay exactly where they were. See lib/actions/recover.ts.
 */
export function useRecoverableActionState<S extends { error?: string }, P = FormData>(
  action: (previous: S, payload: P) => Promise<S>,
  initialState: S,
): [S, (payload: P) => void, boolean] {
  const safe = useMemo(() => recoverable<S, [P]>(action), [action]);
  // React types the state as Awaited<S>; ours is never a promise, so the two
  // are the same thing and the casts only say so.
  type Raw = (previous: unknown, payload: P) => Promise<unknown>;
  return useActionState(safe as unknown as Raw, initialState as unknown) as unknown as [
    S,
    (payload: P) => void,
    boolean,
  ];
}
