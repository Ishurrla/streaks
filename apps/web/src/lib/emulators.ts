export interface EmulatorProblem {
  emulator: "Auth" | "Firestore";
  port: number;
}

export interface EmulatorPorts {
  auth: number;
  firestore: number;
}

/** The ports in firebase.json, which `pnpm dev` uses. */
export const DEFAULT_EMULATOR_PORTS: EmulatorPorts = { auth: 9099, firestore: 8080 };

function port(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
}

/**
 * The emulator ports, from NEXT_PUBLIC_EMULATOR_AUTH_PORT and NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT
 * (the test emulators use other ports), else firebase.json's. They only say where the
 * emulators are: whether the app uses them at all is decided elsewhere, and these never
 * switch that on.
 */
export function emulatorPorts(env: { auth?: string; firestore?: string }): EmulatorPorts {
  return { auth: port(env.auth, DEFAULT_EMULATOR_PORTS.auth), firestore: port(env.firestore, DEFAULT_EMULATOR_PORTS.firestore) };
}

/**
 * The project the browser uses on the emulators: NEXT_PUBLIC_EMULATOR_PROJECT_ID if it is a
 * demo- project (which can never reach live resources), else demo-streaks. The test
 * emulators run as demo-streaks-test, so they never mix with `pnpm dev`'s.
 */
export function emulatorProjectId(value: string | undefined): string {
  return value?.startsWith("demo-") ? value : "demo-streaks";
}

/** Whether the browser uses the emulators: the explicit flag, or no real web config at all. */
export function usesEmulators(env: { flag?: string; apiKey?: string }): boolean {
  return env.flag === "true" || !env.apiKey;
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
