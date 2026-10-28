import type { Metadata } from "next";
import { Bricolage_Grotesque, Caveat, Fraunces } from "next/font/google";
import "./globals.css";

// Fraunces' SOFT + WONK axes give the headlines their warm, slightly quirky character.
const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
});

const body = Bricolage_Grotesque({
  variable: "--font-body",
  subsets: ["latin"],
  axes: ["opsz"],
});

const hand = Caveat({
  variable: "--font-hand",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sniff Test – Do the reviews pass?",
  description: "Paste a Google Maps link and sniff out fake reviews before you book.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${hand.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
