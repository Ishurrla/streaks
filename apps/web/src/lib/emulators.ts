export interface EmulatorProblem {
  emulator: "Auth" | "Firestore";
  port: number;
}

export interface EmulatorPorts {
  auth: number;
  firestore: number;
}

/**
 * Checks the two emulators the app uses: the browser talks to both directly, and the
 * /api routes use them through the Admin SDK. Each answers a plain GET (with CORS
 * headers) when it is up.
 */
export async function checkEmulators(
  host: string,
  ports: EmulatorPorts,
  fetchImpl: typeof fetch = fetch,
): Promise<EmulatorProblem[]> {
  const up = async (port: number) => {
    try {
      return (await fetchImpl(`http://${host}:${port}/`, { signal: AbortSignal.timeout(3000) })).ok;
    } catch {
      return false;
    }
  };

  const [auth, firestore] = await Promise.all([up(ports.auth), up(ports.firestore)]);
  const problems: EmulatorProblem[] = [];
  if (!auth) problems.push({ emulator: "Auth", port: ports.auth });
  if (!firestore) problems.push({ emulator: "Firestore", port: ports.firestore });
  return problems;
}
