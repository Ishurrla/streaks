import type { MetadataRoute } from "next";

// Lets Streaks be added to a phone's Home Screen. iPhone and iPad only allow web push
// for sites opened that way.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Streaks",
    short_name: "Streaks",
    description: "Small habits, one streak at a time.",
    start_url: "/today",
    display: "standalone",
    background_color: "#EAF1EE",
    theme_color: "#13795B",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
