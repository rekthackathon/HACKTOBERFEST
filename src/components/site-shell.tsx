import Link from "next/link";

const links = [["Discover", "/dashboard"], ["Opportunities", "/opportunities"], ["My startup", "/startups"]];
const display = "font-[family-name:var(--font-display)]";

export function SiteShell({ children, active = "Discover" }: { children: React.ReactNode; active?: string }) {
  return <>
    <header className="border-b border-slate-300 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <Link href="/" className={`${display} text-xl font-bold tracking-tight text-teal-900 transition-colors duration-150 hover:text-teal-700`}>ASEAN<span className="font-medium text-teal-700">connect</span></Link>
        <nav aria-label="Main navigation" className="order-3 flex w-full flex-wrap gap-x-7 gap-y-3 text-sm sm:order-none sm:w-auto">
          {links.map(([name, href]) => (
            <Link key={href} href={href} aria-current={active === name ? "page" : undefined}
              className={active === name ? "font-semibold text-slate-900 underline decoration-amber-400 decoration-4 underline-offset-8" : "text-slate-600 underline decoration-transparent decoration-4 underline-offset-8 transition-colors duration-200 hover:text-slate-900 hover:decoration-amber-300"}>
              {name}
            </Link>
          ))}
        </nav>
        <Link href="/auth" className="text-sm font-semibold text-teal-800 underline underline-offset-4 transition-all duration-150 hover:text-teal-950 hover:underline-offset-2">Account setup</Link>
      </div>
    </header>
    <main id="main-content" className="mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-14">{children}</main>
    <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-5 py-8 text-sm text-slate-600 lg:px-8">
      <p>Built for Hacktoberfest Hack Day KL 2026.</p>
      <p>Open source, connected across ASEAN.</p>
    </footer>
  </>;
}