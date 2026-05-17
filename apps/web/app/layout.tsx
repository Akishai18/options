import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/* Type system — modern, slightly rounded, liquid-glass-friendly.
 *   - Geist:       display + body. Characterful enough to not feel like Inter.
 *   - Geist Mono:  data, eyebrows, kbd glyphs.
 *   - Fraunces:    reserved ONLY for tiny italic accents (taglines, AI byline
 *                  drop-caps). No more big serif headlines — too magazine-y. */

const geist = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-geist-mono",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["italic"],
  axes: ["opsz", "SOFT", "WONK"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "StratLab — research workbench",
  description:
    "Conversational quant research workbench. Describe a trading strategy in plain English; get a backtest with anti-overfitting checks built in.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${fraunces.variable}`}
    >
      <body>
        {/* Aurora backdrop — soft color through the glass surfaces */}
        <div className="aurora" aria-hidden />
        <div className="grain-overlay" aria-hidden />
        {children}
      </body>
    </html>
  );
}
