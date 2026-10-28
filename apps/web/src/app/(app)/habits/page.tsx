import type { Metadata } from "next";
import { HabitsView } from "@/components/habits/habits-view";

// Rendered behind the client-side auth guard; see ../layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Habits" };

export default function HabitsPage() {
  return <HabitsView />;
}
