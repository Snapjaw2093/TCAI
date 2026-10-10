"use client";

import { useCallback, useEffect, useState } from "react";

// Loads data for a page and keeps track of the three states every page needs:
// still loading, failed (with a message and a way to retry), or done.
// Pass a loader that is wrapped in useCallback so it only changes when it should.

type State<T> = { data: T | null; error: string; loading: boolean };

export function useLoad<T>(loader: () => Promise<T>) {
  const [state, setState] = useState<State<T>>({ data: null, error: "", loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const data = await loader();
        if (!cancelled) setState({ data, error: "", loading: false });
      } catch (e) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            error: e instanceof Error ? e.message : "Something went wrong.",
            loading: false,
          }));
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [loader, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  // Updates what is on screen right away (after the change was saved).
  const update = useCallback((change: (data: NonNullable<T>) => NonNullable<T>) => {
    setState((s) => (s.data ? { ...s, data: change(s.data) } : s));
  }, []);

  return { ...state, reload, update };
}
