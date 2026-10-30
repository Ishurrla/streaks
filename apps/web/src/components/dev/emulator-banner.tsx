"use client";

import { useEffect, useState } from "react";
import { checkEmulators, type EmulatorProblem } from "@/lib/emulators";
import { devWithEmulators, EMULATOR_PORTS, emulatorHost } from "@/lib/firebase";

/**
 * Development only: says plainly when the Auth or Firestore emulator is not running,
 * instead of sign-up failing with a vague network error. Checks again every few seconds, so it clears once they are up.
 */
export function EmulatorBanner() {
  if (!devWithEmulators) return null;
  return <EmulatorCheck />;
}

function EmulatorCheck() {
  const [problems, setProblems] = useState<EmulatorProblem[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      const found = await checkEmulators(emulatorHost, EMULATOR_PORTS);
      if (cancelled) return;
      setProblems(found);
      timer = setTimeout(run, found.length ? 3000 : 15000);
    };
    run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (problems.length === 0) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-3 top-3 z-50 mx-auto max-w-xl rounded-2xl border-2 border-flame bg-surface p-4 text-sm shadow-card"
    >
      <p className="font-bold">The Firebase emulators are not running</p>
      <p className="mt-1 text-muted">
        Nothing is answering for {problems.map((p) => `${p.emulator} (${emulatorHost}:${p.port})`).join(", ")}, so
        sign-up, log-in and saving will fail. From the repo root, run <code className="font-mono">pnpm dev</code>.
      </p>
    </div>
  );
}
