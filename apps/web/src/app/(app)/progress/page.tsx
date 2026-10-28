import type { Metadata } from "next";
import { ComingSoon, PageHead } from "@/components/views/page-head";

// Rendered behind the client-side auth guard; see ../layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Progress" };

export default function ProgressPage() {
  return (
    <>
      <PageHead title="Progress" />
      <ComingSoon title="Streaks and calendar" body="This screen arrives in phase 5." />
    </>
  );
}
