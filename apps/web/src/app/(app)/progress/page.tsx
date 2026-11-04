import type { Metadata } from "next";
import { Suspense } from "react";
import { ProgressView } from "@/components/progress/progress-view";
import { LoadingCards } from "@/components/views/states";

// Rendered behind the client-side auth guard; see ../layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Progress" };

export default function ProgressPage() {
  return (
    <Suspense fallback={<LoadingCards count={2} />}>
      <ProgressView />
    </Suspense>
  );
}
