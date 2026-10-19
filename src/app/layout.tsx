import "./globals.css";
import localFont from "next/font/local";
import type { Metadata } from "next";

const barlow = localFont({
  src: "../assets/fonts/BarlowCondensed-BlackItalic.ttf",
  variable: "--font-barlow",
  display: "swap",
  weight: "900",
  style: "italic",
});

const barlowUi = localFont({
  src: [
    { path: "../assets/fonts/Barlow-Regular.ttf", weight: "400", style: "normal" },
    { path: "../assets/fonts/Barlow-Medium.ttf", weight: "500", style: "normal" },
    { path: "../assets/fonts/Barlow-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../assets/fonts/Barlow-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-barlow-ui",
  display: "swap",
  fallback: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "StrideFrame — Sports photography, in focus",
  description: "Find the moments that matter. Discover sports photography, find your photos, and keep the finish.",
  icons: {
    icon: [
      { url: "/brand/production/icons/favicon/favicon.ico" },
      { url: "/brand/production/icons/favicon/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/brand/production/icons/apple/apple-touch-icon.png",
  },
  openGraph: {
    title: "StrideFrame — Sports photography, in focus",
    description: "Find the moments that matter.",
    images: ["/brand/production/social/og-image.png"],
  },
};

export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body className={`${barlow.variable} ${barlowUi.variable}`}>{children}</body></html> }
