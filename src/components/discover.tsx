import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";

const examples = [
  { name: "Regional founders launchpad", type: "Accelerator", country: "Malaysia · Singapore", description: "A sample early-stage programme for founders building across Southeast Asia.", initials: "FL", color: "bg-orange-100 text-orange-800" },
  { name: "Sustainable innovation fund", type: "Grant", country: "ASEAN region", description: "A sample funding opportunity for startups exploring sustainable products.", initials: "SI", color: "bg-emerald-100 text-emerald-800" },
  { name: "Build together challenge", type: "Hackathon", country: "Indonesia · Remote", description: "A sample community challenge for teams turning a new idea into a prototype.", initials: "BT", color: "bg-violet-100 text-violet-800" },
];

export function Discover({ opportunitiesOnly = false }: { opportunitiesOnly?: boolean }) {
  return <SiteShell active={opportunitiesOnly ? "Opportunities" : "Discover"}>
    <div className="mb-6 flex flex-wrap items-center gap-2 text-xs font-semibold text-teal-800"><span className="size-2 rounded-full bg-teal-600" aria-hidden="true" />FOUNDATION PREVIEW<span className="font-normal text-slate-500">· Fictional demo data · No live programmes</span></div>
    <div className="grid gap-7 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden space-y-5 lg:block">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="h-16 bg-teal-800" />
          <div className="px-5 pb-5"><div className="-mt-7 mb-3 grid size-14 place-items-center rounded-xl border-4 border-white bg-teal-100 font-bold text-teal-800">AC</div><h2 className="font-semibold">Your next chapter</h2><p className="mt-2 text-sm leading-6 text-slate-500">A home for your startup in the ASEAN ecosystem.</p><Link className="mt-4 inline-block text-sm font-semibold text-teal-800 hover:underline" href="/startups">Prepare your profile →</Link></div>
        </section>
        <div className="px-2 text-sm leading-6 text-slate-500"><p className="mb-2 font-semibold text-slate-700">Built for the region</p><p>Discover programmes, understand requirements, and make your next move.</p></div>
      </aside>
      <div className="min-w-0 space-y-7">
        <section className="relative overflow-hidden rounded-2xl bg-teal-900 p-7 text-white sm:p-10">
          <div aria-hidden="true" className="absolute -right-16 -top-20 size-72 rounded-full border-[45px] border-teal-800/70" />
          <div className="relative max-w-xl"><p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">One region. More possibilities.</p><h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Your startup. Connected to what comes next.</h1><p className="mt-4 max-w-lg text-sm leading-7 text-teal-100">A shared gateway to opportunities across ASEAN, with source-backed eligibility insights powered by open-weight AI.</p><Button asChild className="mt-6 bg-white text-teal-900 hover:bg-teal-50"><Link href="/opportunities#examples">Explore the demo <span aria-hidden="true">↗</span></Link></Button></div>
        </section>
        <section id="examples" aria-labelledby="opportunities-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-teal-700">Discover your next move</p><h2 id="opportunities-heading" className="text-xl font-semibold">{opportunitiesOnly ? "Opportunity examples" : "A window into the ecosystem"}</h2></div><span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">3 fictional examples</span></div>
          <div className="grid gap-4 xl:grid-cols-3">{examples.map(example => <article key={example.name} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5"><div className="mb-5 flex items-center justify-between"><span className={`grid size-11 place-items-center rounded-xl text-sm font-bold ${example.color}`} aria-hidden="true">{example.initials}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{example.type}</span></div><h3 className="font-semibold leading-6">{example.name}</h3><p className="mt-1 text-xs text-slate-500">{example.country}</p><p className="mt-4 flex-1 text-sm leading-6 text-slate-600">{example.description}</p><p className="mt-5 border-t border-slate-100 pt-3 text-xs text-slate-500">Illustrative only · Applications unavailable</p></article>)}</div>
        </section>
        <section className="grid gap-5 rounded-xl border border-teal-200 bg-teal-50 p-6 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-xs font-semibold uppercase tracking-widest text-teal-700">The open-weight AI layer</p><h2 className="mt-2 font-semibold">Less guesswork. Evidence you can inspect.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">The planned Qwen integration extracts programme requirements. Validated rules support deterministic checks; missing or uncertain evidence requires review. Live inference is not connected in this preview.</p></div><span className="w-fit rounded-full border border-teal-200 bg-white px-3 py-2 text-xs font-semibold text-teal-800">Integration pending</span></section>
      </div>
    </div>
  </SiteShell>;
}
