import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";

type Example = { name: string; type: string; country: string; description: string; why: string; missedBecause?: string };

const matches: Example[] = [
  { name: "Regional founders launchpad", type: "Accelerator", country: "Malaysia and Singapore", description: "A sample early-stage programme for founders building across Southeast Asia.", why: "It suits an early-stage team that wants to grow beyond its home market." },
  { name: "Sustainable innovation fund", type: "Grant", country: "ASEAN region", description: "A sample funding opportunity for startups exploring sustainable products.", why: "It funds teams that are still building their first product." },
];

const beyond: Example[] = [
  { name: "Build together challenge", type: "Hackathon", country: "Indonesia, remote", description: "A sample community challenge for teams turning a new idea into a prototype.", why: "It is a quick way to find co-builders and test the idea with real users.", missedBecause: "It is a hackathon in another country, so a search for grants or accelerators would never show it." },
];

const display = "font-[family-name:var(--font-display)]";

function Row({ item }: { item: Example }) {
  return <li className="grid gap-x-8 gap-y-2 px-6 py-6 sm:grid-cols-[170px_minmax(0,1fr)]">
    <div className="text-sm leading-6 text-slate-600"><p className="font-semibold text-slate-900">{item.type}</p><p>{item.country}</p></div>
    <div>
      <h3 className={`${display} text-xl font-semibold leading-snug`}>{item.name}</h3>
      <p className="mt-1 max-w-prose leading-7 text-slate-600">{item.description}</p>
      <p className="mt-3 max-w-prose leading-7"><span className="font-semibold">Why it fits.</span> {item.why}</p>
      {item.missedBecause && <p className="mt-3 max-w-prose leading-7"><mark className="bg-amber-200 px-1.5 py-0.5 font-semibold text-amber-950 [box-decoration-break:clone]">Easy to miss</mark> {item.missedBecause}</p>}
    </div>
  </li>;
}

function Group({ id, title, intro, items }: { id: string; title: string; intro: string; items: Example[] }) {
  return <section aria-labelledby={id} className="mt-12">
    <h2 id={id} className={`${display} text-2xl font-semibold tracking-tight`}>{title}</h2>
    <p className="mt-1 max-w-prose text-slate-600">{intro}</p>
    <ol className="mt-5 divide-y divide-slate-200 rounded-lg border border-slate-300 bg-white">{items.map(i => <Row key={i.name} item={i} />)}</ol>
  </section>;
}

export function Discover({ opportunitiesOnly = false }: { opportunitiesOnly?: boolean }) {
  return <SiteShell active={opportunitiesOnly ? "Opportunities" : "Discover"}>
    <h1 className={`${display} max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl`}>Opportunities you would not have thought to search for.</h1>
    <p className="mt-5 max-w-xl text-lg leading-8 text-slate-700">Tell us about your startup and we show what fits, plus what you would have missed, with the reason beside each one. All examples below are fictional.</p>
    <p className="mt-6 text-sm text-slate-600">Showing a sample profile: pre-seed agritech team in Malaysia. <Link className="font-semibold text-teal-800 underline underline-offset-4" href="/startups">Prepare your own profile</Link></p>
    <div id="examples">
      <Group id="matches-heading" title={opportunitiesOnly ? "Opportunity examples" : "Matches your search"} intro="Opportunities that fit the profile above." items={matches} />
      <Group id="beyond-heading" title="Beyond your search" intro="Opportunities that fit what the team needs, even though nobody would think to look for them." items={beyond} />
    </div>
    <div className="mt-14 grid gap-10 border-t border-slate-300 pt-8 sm:grid-cols-2">
      <section><h2 className={`${display} text-lg font-semibold`}>Saved</h2><p className="mt-2 max-w-sm leading-7 text-slate-600">Nothing saved yet. Saving opens when accounts are connected.</p></section>
      <section><h2 className={`${display} text-lg font-semibold`}>How the AI fits in</h2><p className="mt-2 max-w-sm leading-7 text-slate-600">An open-weight model will read each programme&apos;s requirements and show the source text for every check. The model and provider are not chosen yet, so nothing runs live in this preview.</p><Button asChild variant="outline" className="mt-4"><Link href="/opportunities#examples">Explore the examples</Link></Button></section>
    </div>
  </SiteShell>;
}