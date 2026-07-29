"use client";

import { useEffect, useState } from "react";

/**
 * Drives the ticking "units metered" readouts on the landing page.
 *
 * This is presentational only. It is not connected to the agent service, and
 * deliberately starts at zero on both server and client so the first paint
 * matches and hydration stays clean. Real session data replaces this once the
 * dashboard is wired up.
 */
export function useLiveCounter(intervalMs = 900, step = 0.18): string {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setValue((current) => current + Math.random() * step);
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, step]);

  return value.toFixed(2);
}
