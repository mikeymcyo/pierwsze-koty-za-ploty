import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { preferenceBootScript } from "@/lib/preferences";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SiteBoss Pro — Construction site reports",
    template: "%s · SiteBoss Pro",
  },
  description:
    "Turn site photographs and a voice note into a professional construction progress report, from your phone.",
  applicationName: "SiteBoss Pro",
  // Added to the home screen on site, so it opens like an app rather than a
  // tab: no Safari chrome, the charcoal status bar, and the SB mark.
  appleWebApp: {
    capable: true,
    title: "SiteBoss",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // viewportFit lets the bottom nav sit above the iPhone home indicator.
  viewportFit: "cover",
  // The charcoal the application is drawn on, so the browser furniture and the
  // launch splash match it instead of flashing white.
  themeColor: "#0d0f12",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The boot script stamps this device's appearance on the element before
      // React sees it, so the two disagree by design on the very first render.
      suppressHydrationWarning
    >
      <head>
        {/* Before anything is drawn. A theme applied after hydration is a
            white flash on a dark app - see lib/preferences.ts. */}
        <script dangerouslySetInnerHTML={{ __html: preferenceBootScript() }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
