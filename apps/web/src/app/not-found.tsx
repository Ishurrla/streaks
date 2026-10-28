import Link from "next/link";
import { Flame } from "@/components/icons";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <Flame className="size-16!" />
        <h1 className="text-3xl font-extrabold">This page does not exist</h1>
        <p className="text-muted">The link may be old, or the address may have a typo.</p>
        <Link className="btn mt-2" href="/">
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
