// TTMP-160 PR-7 / FR-12: polling hook for the TopBar badge counter.
// Uses `setTimeout` (not `setInterval`) so a slow/failed fetch doesn't pile up overlapping
// calls — each tick waits for the previous request to settle before scheduling the next.

import { useEffect, useState } from 'react';
import { getMyCheckpointViolationsCount } from '../api/release-checkpoints';

const POLL_INTERVAL_MS = 60_000;

export function useMyCheckpointViolationsCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const n = await getMyCheckpointViolationsCount();
        if (!cancelled) setCount(n);
      } catch (err) {
        // Degrade gracefully: badge keeps the last known value until the next tick, so a
        // transient 401/5xx doesn't spam the user with error toasts once per minute. Log
        // to console for diagnosis — devtools / Sentry can still pick up real outages.
        console.warn('[checkpoints] violations-count poll failed; retrying in 60s', err);
      }
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    // Fire immediately on mount; schedule repeating polls from within.
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return count;
}
