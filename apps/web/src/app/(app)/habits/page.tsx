import type { Metadata } from "next";
import { ComingSoon, PageHead } from "@/components/views/page-head";

// Rendered behind the client-side auth guard; see ../layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Habits" };

export default function HabitsPage() {
  return (
    <>
      <PageHead title="Your habits" />
      <ComingSoon title="Add, edit and remove habits" body="This screen arrives in phase 5." />
    </>
  );
}
