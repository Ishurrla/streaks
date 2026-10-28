"use client";

import { useEffect } from "react";
import { useToast } from "@/components/toast";
import { listenForForegroundMessages } from "@/lib/push";

/**
 * While Streaks is open and in front, the browser does not show push notifications;
 * the message arrives here instead and is shown as a toast.
 */
export function PushListener() {
  const toast = useToast();
  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    listenForForegroundMessages(toast).then((unsubscribe) => {
      if (cancelled) unsubscribe();
      else stop = unsubscribe;
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [toast]);
  return null;
}
