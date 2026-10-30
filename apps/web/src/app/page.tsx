import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarIcon, CheckIcon, Flame, LockIcon, MoonIcon } from "@/components/icons";
import { LandingDemo } from "@/components/landing/landing-demo";
import { LandingNavActions } from "@/components/landing/nav-actions";

// Public landing page. A Server Component; only the demo card and the auth-aware
// nav buttons run in the browser.

const FEATURES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <LockIcon />,
    title: "Private to you",
    body: "Your habits and check-ins belong to you. Nobody else can see or change them.",
  },
  {
    icon: <CheckIcon />,
    title: "One check-in a day",
    body: "A habit counts once per day. You cannot double up to get ahead.",
  },
  {
    icon: <CalendarIcon />,
    title: "Streaks you can trust",
    body: "Streaks are counted on the server, so the number is always the real one.",
  },
  {
    icon: <MoonIcon />,
    title: "A fresh start at midnight",
    body: "Every night the app checks who kept going. Missed a day? Back to zero, back to day one.",
  },
];

const STEPS = [
  { title: "Add your habits", body: "Pick a few small things, like reading for 20 minutes or going for a walk." },
  { title: "Check them off", body: "Open Today and tap each one when you have done it." },
  {
    title: "Watch it grow",
    body: "See your current streak, your best streak and a calendar of every day you showed up.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-280 items-center justify-between gap-2.5 px-5 py-4">
        <div className="flex items-center gap-2 font-display text-xl font-extrabold">
          <Flame live className="size-6.5!" />
          Streaks
        </div>
        <nav aria-label="Account" className="flex items-center gap-2">
          <LandingNavActions />
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-280 items-center gap-10 px-5 pt-7 pb-12 desk:grid-cols-[1.1fr_.9fr] desk:pt-14 desk:pb-20">
          <div>
            <h1 className="text-[clamp(40px,8vw,70px)] leading-none font-extrabold">
              Small habits. <em className="text-flame not-italic">One streak</em> at a time.
            </h1>
            <p className="mt-4.5 mb-6.5 max-w-[46ch] text-lg text-muted">
              Check off the few things you want to do every day. Miss a day and the streak starts over, so you
              keep showing up.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Link className="btn" href="/signup">
                Start your first streak
              </Link>
              <a className="btn btn-ghost" href="#features">
                Look around first
              </a>
            </div>
          </div>

          <div className="rotate-[1.2deg] rounded-[28px] border border-line bg-surface p-5 shadow-card">
            <h2 className="text-xl">Try it. Tap a habit.</h2>
            <p className="mt-0.5 mb-3.5 text-sm text-muted">This is what your Today screen feels like.</p>
            <LandingDemo />
            <div className="mt-4 flex flex-wrap items-center gap-1.25" aria-label="13 of the last 14 days done">
              <span className="mr-1.5 text-[13px] text-muted">Last 14 days</span>
              {Array.from({ length: 14 }, (_, i) => (
                <i key={i} className={`size-3.5 rounded-full ${i === 5 ? "bg-line" : "bg-accent"}`} />
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-280 scroll-mt-4 px-5 py-11">
          <h2 className="mb-6 max-w-[18ch] text-[clamp(28px,4.5vw,42px)] font-extrabold">Built to keep you honest</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3.5">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-[20px] bg-surface p-5 shadow-card">
                <div className="mb-3 grid size-11 place-items-center rounded-[13px] bg-flame-soft text-flame [&_svg]:size-5.5">
                  {f.icon}
                </div>
                <h3 className="mb-1.5 text-lg">{f.title}</h3>
                <p className="text-[15px] text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-280 px-5 py-11">
          <h2 className="mb-6 max-w-[18ch] text-[clamp(28px,4.5vw,42px)] font-extrabold">
            Three steps, then every day
          </h2>
          <ol className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3.5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t-2 border-ink pt-3.5">
                <b className="block font-display text-[46px] leading-none text-flame">{i + 1}</b>
                <h3 className="mt-1.5 mb-1 text-[19px]">{s.title}</h3>
                <p className="text-[15px] text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto mt-6 w-[calc(100%-40px)] max-w-270 rounded-[30px] bg-accent px-6 py-11 text-center text-accent-ink">
          <h2 className="mx-auto mb-4.5 max-w-[20ch] text-[clamp(28px,4.5vw,40px)] font-extrabold">
            Day one starts today.
          </h2>
          <Link className="btn bg-accent-ink! text-accent!" href="/signup">
            Create your free account
          </Link>
        </section>
      </main>

      <footer className="px-5 pt-7 pb-9 text-center text-sm text-muted">Streaks. Check in once a day.</footer>
    </div>
  );
}
