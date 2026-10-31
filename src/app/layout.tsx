import type { Metadata } from "next";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Public_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "ASEAN Connect | Startup opportunity gateway",
  description: "An open-source foundation for connecting ASEAN startups with opportunities and source-backed AI eligibility checks.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en">
    <body className={`${display.variable} ${body.variable} bg-[#F3F5F4] font-[family-name:var(--font-body)] text-slate-900 antialiased`}>
      <a href="#main-content" className="sr-only z-50 rounded bg-white p-3 focus:not-sr-only focus:absolute">Skip to content</a>
      {children}
    </body>
  </html>;
}