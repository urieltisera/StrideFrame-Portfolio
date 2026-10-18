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

export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body className={barlow.variable}>{children}</body></html> }
