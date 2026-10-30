import { describe, expect, it } from "vitest";
import { checkEmulators } from "./emulators";

const PORTS = { auth: 9099, firestore: 8080, functions: 5001 };

/** A fake fetch that answers only on the given ports. */
function fakeFetch(up: number[], backends: unknown = { backends: [{ functionTriggers: [{ name: "ensureProfile" }] }] }) {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (!up.includes(Number(url.port))) throw new TypeError("Failed to fetch");
    const body = url.pathname === "/backends" ? JSON.stringify(backends) : "Ok";
    return new Response(body, { status: 200 });
  }) as typeof fetch;
}

describe("checkEmulators", () => {
  it("reports nothing when all three are up and functions are loaded", async () => {
    expect(await checkEmulators("127.0.0.1", PORTS, fakeFetch([9099, 8080, 5001]))).toEqual([]);
  });

  it("reports each emulator that is not running", async () => {
    expect(await checkEmulators("127.0.0.1", PORTS, fakeFetch([]))).toEqual([
      { kind: "down", emulator: "Auth", port: 9099 },
      { kind: "down", emulator: "Firestore", port: 8080 },
      { kind: "down", emulator: "Functions", port: 5001 },
    ]);
  });

  it("reports a Functions emulator that is running with no functions loaded", async () => {
    const fetchImpl = fakeFetch([9099, 8080, 5001], { backends: [{ functionTriggers: [] }] });
    expect(await checkEmulators("127.0.0.1", PORTS, fetchImpl)).toEqual([{ kind: "noFunctions", port: 5001 }]);
  });
});
