import Link from "next/link";
import { Button } from "@/components/ui/button";

export function SiteShell({ children, active = "Discover" }: { children: React.ReactNode; active?: string }) {
  return <>
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <Link href="/" className="flex items-center gap-3 font-bold tracking-tight"><span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-teal-800 text-lg text-white">a<span className="sr-only">.</span></span><span>ASEAN<span className="font-normal text-teal-700">connect</span></span></Link>
        <nav aria-label="Main navigation" className="order-3 flex w-full flex-wrap gap-x-6 gap-y-3 text-sm sm:order-none sm:w-auto">
          {[["Discover", "/dashboard"], ["Opportunities", "/opportunities"], ["My startup", "/startups"]].map(([name, href]) => <Link key={href} href={href} aria-current={active === name ? "page" : undefined} className={active === name ? "font-semibold text-teal-800 underline decoration-2 underline-offset-8" : "text-slate-600 hover:text-teal-800"}>{name}</Link>)}
        </nav>
        <Button asChild variant="outline"><Link href="/auth">Account setup</Link></Button>
      </div>
    </header>
    <main id="main-content" className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">{children}</main>
    <footer className="mx-auto flex max-w-7xl flex-wrap justify-between gap-3 px-5 py-8 text-xs text-slate-500 lg:px-8"><p>Built for Hacktoberfest Hack Day KL 2026.</p><p>Open source. Connected across ASEAN.</p></footer>
  </>;
}
