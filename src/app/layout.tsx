import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASEAN Connect | Startup opportunity gateway",
  description: "An open-source foundation for connecting ASEAN startups with opportunities and source-backed AI eligibility checks.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a href="#main-content" className="sr-only z-50 rounded bg-white p-3 focus:not-sr-only focus:absolute">Skip to content</a>{children}</body></html>;
}
