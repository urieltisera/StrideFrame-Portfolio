import "./globals.css";
import localFont from "next/font/local";

const oxanium = localFont({
  src: "../assets/fonts/Oxanium-wght.woff2",
  variable: "--font-oxanium",
  display: "swap",
  weight: "200 800",
  style: "normal",
});

export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body className={oxanium.variable}>{children}</body></html> }
