import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans, Google_Sans } from "next/font/google";
import { themeScript } from "@/lib/theme";
import { Providers } from "./providers";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-bricolage",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

// Only the Google sign-in button uses this, as Google's branding guidelines ask.
const googleSans = Google_Sans({
  subsets: ["latin"],
  weight: "500",
  variable: "--font-google-sans",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Streaks: small habits, one streak at a time", template: "%s · Streaks" },
  description: "Check off the few things you want to do every day. Miss a day and the streak starts over.",
  appleWebApp: { capable: true, title: "Streaks", statusBarStyle: "default" },
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EAF1EE" },
    { media: "(prefers-color-scheme: dark)", color: "#0C1513" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script may set data-theme before React hydrates.
    <html lang="en" className={`${bricolage.variable} ${dmSans.variable} ${googleSans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
