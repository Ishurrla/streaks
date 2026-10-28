import type { ReactNode } from "react";
import { AppGuard } from "@/components/shell/app-guard";
import { AppShell } from "@/components/shell/app-shell";

// Everything in this group needs a signed-in user with a profile. The guard shows a
// splash until Firebase Auth restores the session in the browser, so these pages never
// render on the server; each page opts out of instant-navigation validation for that
// reason. Once signed in, this layout and its auth state persist across tab changes.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppGuard>
      <AppShell>{children}</AppShell>
    </AppGuard>
  );
}
