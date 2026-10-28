import type { Metadata } from "next";
import { ProgressView } from "@/components/progress/progress-view";

// Rendered behind the client-side auth guard; see ../layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Progress" };

export default function ProgressPage() {
  return <ProgressView />;
}
