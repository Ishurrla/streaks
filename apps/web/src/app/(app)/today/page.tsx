import type { Metadata } from "next";
import { TodayView } from "@/components/views/today-view";

// Rendered behind the client-side auth guard; see ../layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return <TodayView />;
}
