export type EmulatorProblem =
  | { kind: "down"; emulator: "Auth" | "Firestore" | "Functions"; port: number }
  | { kind: "noFunctions"; port: number };

export interface EmulatorPorts {
  auth: number;
  firestore: number;
  functions: number;
}

/**
 * Checks the Emulator Suite the way the app uses it. Each emulator answers a plain GET
 * (with CORS headers) when it is up. The Functions emulator can also be up with no
 * functions loaded (its code failed or timed out while loading); then every callable,
 * starting with ensureProfile after sign-up, fails. The 404 has no CORS headers, so in
 * the browser the SDK reports it as functions/internal rather than not-found.
 */
export async function checkEmulators(
  host: string,
  ports: EmulatorPorts,
  fetchImpl: typeof fetch = fetch,
): Promise<EmulatorProblem[]> {
  const get = async (port: number, path = "/") => {
    try {
      const res = await fetchImpl(`http://${host}:${port}${path}`, { signal: AbortSignal.timeout(3000) });
      return res.ok ? res : null;
    } catch {
      return null;
    }
  };

  const [auth, firestore, functions] = await Promise.all([
    get(ports.auth),
    get(ports.firestore),
    get(ports.functions, "/backends"),
  ]);

  const problems: EmulatorProblem[] = [];
  if (!auth) problems.push({ kind: "down", emulator: "Auth", port: ports.auth });
  if (!firestore) problems.push({ kind: "down", emulator: "Firestore", port: ports.firestore });
  if (!functions) {
    problems.push({ kind: "down", emulator: "Functions", port: ports.functions });
  } else {
    const body = (await functions.json().catch(() => null)) as { backends?: { functionTriggers?: unknown[] }[] } | null;
    const loaded = body?.backends?.some((b) => (b.functionTriggers?.length ?? 0) > 0) ?? false;
    if (!loaded) problems.push({ kind: "noFunctions", port: ports.functions });
  }
  return problems;
}
