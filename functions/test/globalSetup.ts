// The Functions emulator can still be loading code when emulators:exec starts the
// tests, and early calls then get a 404. Wait until a callable answers.
export default async function waitForFunctions(): Promise<void> {
  const url = "http://127.0.0.1:5001/demo-streaks/europe-west1/ensureProfile";
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: {} }),
      });
      if (res.status !== 404) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Functions emulator did not become ready in 30s");
}
