import { describe, expect, it } from "vitest";
import { checkEmulators } from "./emulators";

const PORTS = { auth: 9099, firestore: 8080 };

/** A fake fetch that answers only on the given ports. */
function fakeFetch(up: number[]) {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (!up.includes(Number(url.port))) throw new TypeError("Failed to fetch");
    return new Response("Ok", { status: 200 });
  }) as typeof fetch;
}

describe("checkEmulators", () => {
  it("reports nothing when both are up", async () => {
    expect(await checkEmulators("127.0.0.1", PORTS, fakeFetch([9099, 8080]))).toEqual([]);
  });

  it("reports each emulator that is not running", async () => {
    expect(await checkEmulators("127.0.0.1", PORTS, fakeFetch([]))).toEqual([
      { emulator: "Auth", port: 9099 },
      { emulator: "Firestore", port: 8080 },
    ]);
    expect(await checkEmulators("127.0.0.1", PORTS, fakeFetch([9099]))).toEqual([{ emulator: "Firestore", port: 8080 }]);
  });
});
