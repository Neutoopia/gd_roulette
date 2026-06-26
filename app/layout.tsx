import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "GD Roulette — Level Grinder Tracker",
  description:
    "Get assigned a random Geometry Dash level, grind it, and track every run.",
};

export const viewport: Viewport = {
  themeColor: "#00e5cc",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable}`}>
      <body style={{ position: "relative", zIndex: 1 }}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
