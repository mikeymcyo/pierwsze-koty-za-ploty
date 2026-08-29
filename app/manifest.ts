import type { MetadataRoute } from "next";

/**
 * The home-screen app.
 *
 * SiteBoss is added to the home screen on site and opened like an app, so it
 * declares its own name, icons and colours rather than borrowing Safari's. The
 * charcoal theme colour is what makes the status bar and the splash match the
 * application instead of flashing white on launch.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SiteBoss Pro",
    short_name: "SiteBoss",
    description:
      "Report it. Prove it. Move forward. Construction site reports, surveys and evidence from your phone.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d0f12",
    theme_color: "#0d0f12",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
