import { describe, expect, it } from "vitest";
import { checkEmulators, emulatorPorts, emulatorProjectId, usesEmulators } from "./emulators";

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

describe("emulatorPorts", () => {
  it("uses firebase.json's ports by default", () => {
    expect(emulatorPorts({})).toEqual({ auth: 9099, firestore: 8080 });
  });

  it("takes the test emulator ports from the variables", () => {
    expect(emulatorPorts({ auth: "9199", firestore: "8180" })).toEqual({ auth: 9199, firestore: 8180 });
  });

  it("ignores values that are not a port", () => {
    expect(emulatorPorts({ auth: "abc", firestore: "70000" })).toEqual({ auth: 9099, firestore: 8080 });
    expect(emulatorPorts({ auth: "", firestore: "-1" })).toEqual({ auth: 9099, firestore: 8080 });
  });
});

describe("emulatorProjectId", () => {
  it("is demo-streaks unless another demo- project is named", () => {
    expect(emulatorProjectId(undefined)).toBe("demo-streaks");
    expect(emulatorProjectId("demo-streaks-test")).toBe("demo-streaks-test");
  });

  it("never names a real project", () => {
    expect(emulatorProjectId("streaks-b1dca")).toBe("demo-streaks");
    expect(emulatorProjectId("")).toBe("demo-streaks");
  });
});

describe("usesEmulators", () => {
  it("is on with the flag or with no real config, and only then", () => {
    expect(usesEmulators({ flag: "true", apiKey: "real-key" })).toBe(true);
    expect(usesEmulators({ apiKey: undefined })).toBe(true);
    expect(usesEmulators({ flag: "false", apiKey: "real-key" })).toBe(false);
    expect(usesEmulators({ apiKey: "real-key" })).toBe(false);
  });
});
