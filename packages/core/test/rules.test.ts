import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { emulatorProjectId } from "../src/admin";

const PROJECT_ID = emulatorProjectId();

let env: RulesTestEnvironment;

const ALICE = "alice";
const BOB = "bob";

const userDoc = {
  name: "Alice",
  timezone: "Africa/Lagos",
  reminderEnabled: false,
  reminderTime: "20:00",
  theme: "system",
  freezesAvailable: 1,
  nextRolloverAt: Timestamp.fromDate(new Date("2026-10-28T23:00:00Z")),
  lastReminderDate: null,
  nextReminderAt: null,
  lastClosedDate: "2026-10-27",
};

const habitDoc = {
  name: "Read 10 pages",
  color: "#13795B",
  createdAt: Timestamp.now(),
  currentStreak: 3,
  bestStreak: 5,
  lastCheckInDate: "2026-10-28",
  days: [0, 2, 4],
  nextDays: null,
  nextDaysFrom: null,
  pastDays: [],
  milestonesEarned: [3],
};

const newHabit = () => ({
  name: "Drink water",
  color: "#3B6FD8",
  createdAt: serverTimestamp(),
  currentStreak: 0,
  bestStreak: 0,
  lastCheckInDate: null,
});

const alice = () => env.authenticatedContext(ALICE).firestore() as unknown as Firestore;
const bob = () => env.authenticatedContext(BOB).firestore() as unknown as Firestore;
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, "users", ALICE), userDoc);
    await setDoc(doc(db, "users", BOB), { ...userDoc, name: "Bob" });
    await setDoc(doc(db, "users", ALICE, "habits", "h1"), habitDoc);
    await setDoc(doc(db, "users", ALICE, "habits", "h1", "checkIns", "2026-10-28"), { createdAt: Timestamp.now() });
    await setDoc(doc(db, "users", ALICE, "habits", "h1", "freezeUses", "2026-10-26"), { createdAt: Timestamp.now() });
  });
});

describe("user documents", () => {
  it("lets a user read their own profile", async () => {
    await assertSucceeds(getDoc(doc(alice(), "users", ALICE)));
  });

  it("stops another user reading, updating or deleting it", async () => {
    await assertFails(getDoc(doc(bob(), "users", ALICE)));
    await assertFails(updateDoc(doc(bob(), "users", ALICE), { name: "Hacked" }));
    await assertFails(deleteDoc(doc(bob(), "users", ALICE)));
  });

  it("stops signed-out users reading anything", async () => {
    await assertFails(getDoc(doc(anon(), "users", ALICE)));
    await assertFails(getDoc(doc(anon(), "users", ALICE, "habits", "h1")));
  });

  it("does not allow listing the users collection", async () => {
    await assertFails(getDocs(collection(alice(), "users")));
  });

  it("allows updating name, reminders and theme", async () => {
    await assertSucceeds(
      updateDoc(doc(alice(), "users", ALICE), {
        name: "Alice B",
        reminderEnabled: true,
        reminderTime: "21:30",
        theme: "dark",
      }),
    );
  });

  it("validates the editable fields", async () => {
    const ref = doc(alice(), "users", ALICE);
    await assertFails(updateDoc(ref, { name: "" }));
    await assertFails(updateDoc(ref, { name: "x".repeat(51) }));
    await assertFails(updateDoc(ref, { theme: "neon" }));
    await assertFails(updateDoc(ref, { reminderTime: "25:00" }));
    await assertFails(updateDoc(ref, { reminderEnabled: "yes" }));
  });

  it("blocks every server-owned field", async () => {
    const ref = doc(alice(), "users", ALICE);
    await assertFails(updateDoc(ref, { freezesAvailable: 99 }));
    await assertFails(updateDoc(ref, { timezone: "Asia/Tokyo" }));
    await assertFails(updateDoc(ref, { nextRolloverAt: Timestamp.now() }));
    await assertFails(updateDoc(ref, { lastReminderDate: "2026-10-28" }));
    await assertFails(updateDoc(ref, { nextReminderAt: Timestamp.now() }));
    await assertFails(updateDoc(ref, { lastClosedDate: "2026-10-20" }));
    await assertFails(updateDoc(ref, { isAdmin: true }));
    // Sneaking a server field in alongside an allowed one is still rejected.
    await assertFails(updateDoc(ref, { theme: "dark", freezesAvailable: 99 }));
  });

  it("cannot be created or deleted by the client, even by its owner", async () => {
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore() as unknown as Firestore, "users", ALICE)));
    await assertFails(setDoc(doc(alice(), "users", ALICE), userDoc));
    await assertFails(deleteDoc(doc(bob(), "users", BOB)));
  });
});

describe("habits", () => {
  it("lets the owner read their habits, and nobody else", async () => {
    await assertSucceeds(getDocs(collection(alice(), "users", ALICE, "habits")));
    await assertFails(getDocs(collection(bob(), "users", ALICE, "habits")));
    await assertFails(getDoc(doc(bob(), "users", ALICE, "habits", "h1")));
  });

  it("allows creating a habit with zeroed stats", async () => {
    await assertSucceeds(setDoc(doc(alice(), "users", ALICE, "habits", "new"), newHabit()));
  });

  it("rejects a new habit with non-zero, missing or extra stats", async () => {
    const ref = doc(alice(), "users", ALICE, "habits", "new");
    await assertFails(setDoc(ref, { ...newHabit(), currentStreak: 10 }));
    await assertFails(setDoc(ref, { ...newHabit(), bestStreak: 10 }));
    await assertFails(setDoc(ref, { ...newHabit(), lastCheckInDate: "2026-10-28" }));
    await assertFails(setDoc(ref, { ...newHabit(), extra: true }));
    const { currentStreak: _omit, ...missingStat } = newHabit();
    await assertFails(setDoc(ref, missingStat));
  });

  it("validates habit name, colour and createdAt", async () => {
    const ref = doc(alice(), "users", ALICE, "habits", "new");
    await assertFails(setDoc(ref, { ...newHabit(), name: "" }));
    await assertFails(setDoc(ref, { ...newHabit(), name: "x".repeat(41) }));
    await assertFails(setDoc(ref, { ...newHabit(), color: "#000000" }));
    await assertFails(setDoc(ref, { ...newHabit(), createdAt: Timestamp.fromDate(new Date("2020-01-01")) }));
  });

  it("stops another user creating habits in your account", async () => {
    await assertFails(setDoc(doc(bob(), "users", ALICE, "habits", "new"), newHabit()));
  });

  it("allows renaming and recolouring", async () => {
    await assertSucceeds(
      updateDoc(doc(alice(), "users", ALICE, "habits", "h1"), { name: "Read 20 pages", color: "#C2569A" }),
    );
  });

  it("allows choosing days and an empty milestones list when creating a habit", async () => {
    const ref = doc(alice(), "users", ALICE, "habits", "new");
    await assertSucceeds(setDoc(ref, { ...newHabit(), days: [0, 2, 4], milestonesEarned: [] }));
    await assertSucceeds(setDoc(doc(alice(), "users", ALICE, "habits", "all"), { ...newHabit(), days: [6, 5, 4, 3, 2, 1, 0] }));
  });

  it("rejects invalid days, earned milestones and pending schedules on a new habit", async () => {
    const ref = doc(alice(), "users", ALICE, "habits", "new");
    for (const days of [[], [7], [-1], [1, 1], ["mon"], [0, 1, 2, 3, 4, 5, 6, 0], "0,2,4", 3]) {
      await assertFails(setDoc(ref, { ...newHabit(), days }));
    }
    await assertFails(setDoc(ref, { ...newHabit(), milestonesEarned: [3] }));
    await assertFails(setDoc(ref, { ...newHabit(), milestonesEarned: [3, 7, 14] }));
    await assertFails(setDoc(ref, { ...newHabit(), nextDays: [5, 6] }));
    await assertFails(setDoc(ref, { ...newHabit(), nextDaysFrom: "2026-10-29" }));
    await assertFails(setDoc(ref, { ...newHabit(), pastDays: [] }));
  });

  it("blocks every schedule and milestone field after creation", async () => {
    const ref = doc(alice(), "users", ALICE, "habits", "h1");
    await assertFails(updateDoc(ref, { days: [5, 6] }));
    await assertFails(updateDoc(ref, { days: [0, 1, 2, 3, 4, 5, 6] }));
    await assertFails(updateDoc(ref, { nextDays: [5, 6] }));
    await assertFails(updateDoc(ref, { nextDaysFrom: "2026-10-28" }));
    await assertFails(updateDoc(ref, { nextDays: [5, 6], nextDaysFrom: "2026-10-28" }));
    await assertFails(updateDoc(ref, { pastDays: [{ until: "2026-10-01", days: [6] }] }));
    // (Writing a field's current value back is allowed: it changes nothing.)
    await assertFails(updateDoc(ref, { milestonesEarned: [3, 7, 14, 30, 60, 100, 365] }));
    await assertFails(updateDoc(ref, { milestonesEarned: [] }));
    // Alongside an allowed rename, still rejected.
    await assertFails(updateDoc(ref, { name: "Renamed", days: [5, 6] }));
    await assertFails(updateDoc(ref, { name: "Renamed", milestonesEarned: [365] }));
    // Nor by another user.
    await assertFails(updateDoc(doc(bob(), "users", ALICE, "habits", "h1"), { days: [5, 6] }));
  });

  it("blocks updates to stats and createdAt", async () => {
    const ref = doc(alice(), "users", ALICE, "habits", "h1");
    await assertFails(updateDoc(ref, { currentStreak: 100 }));
    await assertFails(updateDoc(ref, { bestStreak: 100 }));
    await assertFails(updateDoc(ref, { lastCheckInDate: "2026-10-29" }));
    await assertFails(updateDoc(ref, { createdAt: Timestamp.now() }));
    await assertFails(updateDoc(ref, { name: "Renamed", currentStreak: 100 }));
  });

  it("stops another user editing your habit", async () => {
    await assertFails(updateDoc(doc(bob(), "users", ALICE, "habits", "h1"), { name: "Mine now" }));
  });

  it("cannot be deleted directly (deleteHabit does it)", async () => {
    await assertFails(deleteDoc(doc(alice(), "users", ALICE, "habits", "h1")));
  });
});

describe("checkIns and freezeUses", () => {
  const checkIn = (db: Firestore, date: string) => doc(db, "users", ALICE, "habits", "h1", "checkIns", date);
  const freezeUse = (db: Firestore, date: string) => doc(db, "users", ALICE, "habits", "h1", "freezeUses", date);

  it("are readable by the owner only", async () => {
    await assertSucceeds(getDocs(collection(alice(), "users", ALICE, "habits", "h1", "checkIns")));
    await assertSucceeds(getDocs(collection(alice(), "users", ALICE, "habits", "h1", "freezeUses")));
    await assertFails(getDoc(checkIn(bob(), "2026-10-28")));
    await assertFails(getDoc(freezeUse(bob(), "2026-10-26")));
  });

  it("cannot be created, changed or deleted by the owner", async () => {
    await assertFails(setDoc(checkIn(alice(), "2026-10-29"), { createdAt: Timestamp.now() }));
    await assertFails(setDoc(checkIn(alice(), "2026-10-28"), { createdAt: Timestamp.now() }));
    await assertFails(deleteDoc(checkIn(alice(), "2026-10-28")));
    await assertFails(setDoc(freezeUse(alice(), "2026-10-27"), { createdAt: Timestamp.now() }));
    await assertFails(deleteDoc(freezeUse(alice(), "2026-10-26")));
  });

  it("cannot be written by another user", async () => {
    await assertFails(setDoc(checkIn(bob(), "2026-10-29"), { createdAt: Timestamp.now() }));
    await assertFails(setDoc(freezeUse(bob(), "2026-10-27"), { createdAt: Timestamp.now() }));
  });
});

describe("nextReminderAt", () => {
  it("cannot be set, moved or cleared by the client, even with an allowed change alongside", async () => {
    // As the server would have it with reminders on: a scheduled time.
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore() as unknown as Firestore, "users", ALICE), {
        reminderEnabled: true,
        nextReminderAt: Timestamp.fromDate(new Date("2026-10-28T19:00:00Z")),
      }),
    );
    const ref = doc(alice(), "users", ALICE);
    // Pulling the reminder forward, pushing it back, clearing it, or bundling it with a
    // reminder setting the client may change: all rejected. Only the server writes it.
    await assertFails(updateDoc(ref, { nextReminderAt: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")) }));
    await assertFails(updateDoc(ref, { nextReminderAt: Timestamp.fromDate(new Date("2099-01-01T00:00:00Z")) }));
    await assertFails(updateDoc(ref, { nextReminderAt: "now" }));
    await assertFails(updateDoc(ref, { nextReminderAt: null }));
    await assertFails(updateDoc(ref, { reminderEnabled: true, nextReminderAt: Timestamp.now() }));
    await assertFails(updateDoc(ref, { reminderTime: "07:00", nextReminderAt: null }));
    // The same settings change without it is fine.
    await assertSucceeds(updateDoc(ref, { reminderEnabled: true, reminderTime: "07:00" }));
  });

  it("cannot be set by another user either", async () => {
    await assertFails(updateDoc(doc(bob(), "users", ALICE), { nextReminderAt: Timestamp.now() }));
  });
});

describe("pushTokens", () => {
  it("cannot be read or written by the client, even by its owner", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore() as unknown as Firestore, "users", ALICE, "pushTokens", "t1"), { token: "abc" }),
    );
    await assertFails(getDoc(doc(alice(), "users", ALICE, "pushTokens", "t1")));
    await assertFails(setDoc(doc(alice(), "users", ALICE, "pushTokens", "t2"), { token: "def" }));
    await assertFails(deleteDoc(doc(alice(), "users", ALICE, "pushTokens", "t1")));
    await assertFails(setDoc(doc(bob(), "users", ALICE, "pushTokens", "t3"), { token: "ghi" }));
  });
});

describe("default deny", () => {
  it("blocks the cron status documents for every client", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore() as unknown as Firestore, "cron", "rollover"), { lastSuccessfulRun: Timestamp.now() }),
    );
    for (const db of [alice(), bob(), anon()]) {
      await assertFails(getDoc(doc(db, "cron", "rollover")));
      await assertFails(setDoc(doc(db, "cron", "rollover"), { lastSuccessfulRun: Timestamp.now() }));
      await assertFails(setDoc(doc(db, "cron", "reminders"), { lastSuccessfulRun: Timestamp.now() }));
    }
  });

  it("blocks collections outside users/{uid}", async () => {
    await assertFails(getDoc(doc(alice(), "admin", "config")));
    await assertFails(setDoc(doc(alice(), "anything", "x"), { a: 1 }));
  });
});
