import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";

export function FoundationStatus({ title, description, items, active }: { title: string; description: string; items: string[]; active?: string }) {
  return <SiteShell active={active}>
    <section className="max-w-2xl">
      <p className="w-fit bg-amber-200 px-2 py-1 text-sm font-semibold text-amber-950">Foundation preview, not connected</p>
      <h1 className="mt-6 font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight tracking-tight">{title}</h1>
      <p className="mt-4 max-w-prose text-lg leading-8 text-slate-700">{description}</p>
      <ul className="my-8 divide-y divide-slate-200 border-y border-slate-300 bg-white">{items.map(item => <li key={item} className="px-5 py-4 leading-7 text-slate-700">{item}</li>)}</ul>
      <Button asChild><Link href="/dashboard">Back to discovery</Link></Button>
    </section>
  </SiteShell>;
}