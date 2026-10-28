"use client";

import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export type Subscribe<T> = (next: (data: T) => void, fail: (error: Error) => void) => () => void;

/**
 * Keeps a Firestore listener's latest value in the TanStack Query cache under `key`.
 * The cache means a screen you come back to renders at once with the last snapshot
 * while the listener reconnects. Pass `subscribe: null` to stay idle.
 */
export function useLive<T>(key: QueryKey, subscribe: Subscribe<T> | null) {
  const queryClient = useQueryClient();
  const hash = JSON.stringify(key);
  const [failure, setFailure] = useState<{ hash: string; error: Error } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!subscribe) return;
    return subscribe(
      (data) => {
        queryClient.setQueryData(key, data);
        setFailure(null);
      },
      (error) => setFailure({ hash, error }),
    );
    // The key is compared by value through `hash`; `subscribe` is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, attempt, subscribe === null]);

  const { data } = useQuery<T>({
    queryKey: key,
    queryFn: () => queryClient.getQueryData<T>(key) as T,
    enabled: false,
    staleTime: Infinity,
  });

  const error = failure?.hash === hash ? failure.error : null;
  return {
    data,
    error,
    isLoading: data === undefined && !error,
    retry: () => setAttempt((n) => n + 1),
  };
}
