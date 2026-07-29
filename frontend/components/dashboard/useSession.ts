"use client";

import { useCallback, useEffect, useState } from "react";

import {
  endSession,
  getActiveSession,
  getSessionLog,
  startSession,
  updateSpendingLimit,
  type SessionLog,
} from "@/lib/api";

const POLL_INTERVAL_MS = 2000;

export type SessionState = {
  sessionId: string | null;
  log: SessionLog | null;
  /** True while looking for an existing session on mount. */
  loading: boolean;
  starting: boolean;
  error: string | null;
  start: (spendingLimit: number) => Promise<void>;
  setLimit: (spendingLimit: number) => Promise<void>;
  stop: () => Promise<void>;
  clearError: () => void;
};

/**
 * Owns the metering session for the connected wallet.
 *
 * Polls the agent service rather than holding a socket: the settlement cadence
 * is seconds, and polling survives the backend restarting without leaving the
 * dashboard in a dead state.
 */
export function useSession(walletAddress: string | null): SessionState {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [log, setLog] = useState<SessionLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resume an existing session, so a refresh does not start a second one.
  useEffect(() => {
    if (!walletAddress) return;

    let cancelled = false;

    (async () => {
      const result = await getActiveSession(walletAddress);
      if (cancelled) return;

      if (result.ok) {
        setSessionId(result.data.session?.session_id ?? null);
      } else {
        setError(result.error);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  // Poll the log while a session exists.
  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    const tick = async () => {
      const result = await getSessionLog(sessionId);
      if (cancelled) return;

      if (result.ok) {
        setLog(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionId]);

  const start = useCallback(
    async (spendingLimit: number) => {
      if (!walletAddress) return;
      setStarting(true);
      setError(null);

      const result = await startSession(walletAddress, spendingLimit);
      if (result.ok) {
        setSessionId(result.data.session_id);
      } else {
        setError(result.error);
      }
      setStarting(false);
    },
    [walletAddress]
  );

  const setLimit = useCallback(
    async (spendingLimit: number) => {
      if (!sessionId) return;

      const result = await updateSpendingLimit(sessionId, spendingLimit);
      if (result.ok) {
        // Reflect it immediately rather than waiting for the next poll.
        setLog((current) =>
          current
            ? { ...current, spending_limit: result.data.spending_limit }
            : current
        );
      } else {
        setError(result.error);
      }
    },
    [sessionId]
  );

  const stop = useCallback(async () => {
    if (!sessionId) return;
    await endSession(sessionId);
    setSessionId(null);
    setLog(null);
  }, [sessionId]);

  return {
    sessionId,
    // Derived rather than cleared in an effect, so the log can never briefly
    // describe a session that is no longer selected.
    log: sessionId ? log : null,
    loading,
    starting,
    error,
    start,
    setLimit,
    stop,
    clearError: () => setError(null),
  };
}
