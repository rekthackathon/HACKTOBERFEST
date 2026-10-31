"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

const display = "font-[family-name:var(--font-display)]";
const field = "min-h-11 w-full rounded-md border border-slate-400 bg-white px-3 text-base transition-colors duration-150 hover:border-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";
const chipBase = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";

const countries = ["Brunei", "Cambodia", "Indonesia", "Laos", "Malaysia", "Myanmar", "Philippines", "Singapore", "Thailand", "Timor-Leste", "Vietnam"];
const stages = ["Idea", "Pre-seed", "Seed", "Series A", "Growth"];
const sectorOptions = ["Agritech", "Fintech", "Healthtech", "Edtech", "Logistics", "Climate", "E-commerce", "AI and data", "Other"];
const lookingOptions = ["Funding", "Customers", "Accelerator", "Mentors", "Talent", "Partners", "Regional expansion"];

type Profile = { name: string; tagline: string; about: string; website: string; country: string; stage: string; sectors: string[]; looking: string[] };

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return <section className="grid gap-x-10 gap-y-4 border-t border-slate-300 py-8 first:border-t-0 first:pt-0 sm:grid-cols-[190px_minmax(0,1fr)]">
    <div><h2 className={`${display} text-lg font-semibold`}>{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{hint}</p></div>
    <div className="space-y-5">{children}</div>
  </section>;
}

function Chips({ label, options, value, onToggle }: { label: string; options: string[]; value: string[]; onToggle: (o: string) => void }) {
  return <div role="group" aria-label={label} className="flex flex-wrap gap-2">
    {options.map(o => <button key={o} type="button" aria-pressed={value.includes(o)} onClick={() => onToggle(o)}
      className={`${chipBase} ${value.includes(o) ? "border-teal-800 bg-teal-800 text-white" : "border-slate-400 bg-white text-slate-900 hover:border-slate-700 hover:bg-slate-50"}`}>{o}</button>)}
  </div>;
}

export function StartupProfileForm() {
  const [p, setP] = useState<Profile>({ name: "", tagline: "", about: "", website: "", country: "", stage: "", sectors: [], looking: [] });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setP(prev => ({ ...prev, [key]: value }));
  const toggle = (key: "sectors" | "looking", option: string) => setP(prev => ({ ...prev, [key]: prev[key].includes(option) ? prev[key].filter(x => x !== option) : [...prev[key], option] }));
  const initials = p.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "S";
  const muted = "text-slate-500";

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!p.name.trim()) { setNotice(""); return setError("Enter your startup name."); }
    setError("");
    // TODO (backend): save this profile with the Supabase helper.
    setNotice("Profile saving is not connected yet, so nothing was stored.");
  }

  return <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
    <form onSubmit={onSubmit} noValidate>
      <Section title="Basics" hint="The first thing people and matches see.">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-semibold">Startup name</label>
          <input id="name" value={p.name} onChange={e => set("name", e.target.value)} autoComplete="organization" className={field} />
        </div>
        <div>
          <label htmlFor="tagline" className="mb-1.5 block text-sm font-semibold">One-line bio</label>
          <input id="tagline" value={p.tagline} maxLength={100} onChange={e => set("tagline", e.target.value)} aria-describedby="tagline-count" className={field} />
          <p id="tagline-count" className="mt-1.5 text-sm text-slate-600">{p.tagline.length} of 100 characters</p>
        </div>
        <div>
          <label htmlFor="website" className="mb-1.5 block text-sm font-semibold">Website</label>
          <input id="website" type="url" value={p.website} onChange={e => set("website", e.target.value)} autoComplete="url" className={field} />
        </div>
      </Section>

      <Section title="About" hint="A few sentences on the problem you solve and for whom.">
        <div>
          <label htmlFor="about" className="mb-1.5 block text-sm font-semibold">About your startup</label>
          <textarea id="about" rows={5} value={p.about} maxLength={500} onChange={e => set("about", e.target.value)} aria-describedby="about-count" className={`${field} py-2.5`} />
          <p id="about-count" className="mt-1.5 text-sm text-slate-600">{p.about.length} of 500 characters</p>
        </div>
      </Section>

      <Section title="Focus" hint="Where you are and what you build. Matches use this.">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="country" className="mb-1.5 block text-sm font-semibold">Based in</label>
            <select id="country" value={p.country} onChange={e => set("country", e.target.value)} className={field}><option value="">Choose a country</option>{countries.map(c => <option key={c}>{c}</option>)}</select>
          </div>
          <div>
            <label htmlFor="stage" className="mb-1.5 block text-sm font-semibold">Stage</label>
            <select id="stage" value={p.stage} onChange={e => set("stage", e.target.value)} className={field}><option value="">Choose a stage</option>{stages.map(s => <option key={s}>{s}</option>)}</select>
          </div>
        </div>
        <div><p className="mb-2 text-sm font-semibold">Sectors</p><Chips label="Sectors" options={sectorOptions} value={p.sectors} onToggle={o => toggle("sectors", o)} /></div>
      </Section>

      <Section title="Looking for" hint="Pick what would help most right now.">
        <Chips label="Looking for" options={lookingOptions} value={p.looking} onToggle={o => toggle("looking", o)} />
      </Section>

      <div className="space-y-4 border-t border-slate-300 pt-8">
        {error && <p role="alert" className="border-l-4 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}
        {notice && <p role="status" className="bg-amber-200 px-3 py-2 text-sm font-semibold text-amber-950">{notice}</p>}
        <Button type="submit">Save profile</Button>
      </div>
    </form>

    <aside aria-label="Profile preview" className="lg:sticky lg:top-6">
      <p className="mb-3 text-sm font-semibold text-slate-700">How your profile reads</p>
      <div className="rounded-lg border border-slate-300 bg-white p-6">
        <div className="grid size-16 place-items-center rounded-full bg-teal-800 text-xl font-bold text-white" aria-hidden="true">{initials}</div>
        <h2 className={`${display} mt-4 text-xl font-semibold leading-snug ${p.name ? "" : muted}`}>{p.name || "Your startup name"}</h2>
        <p className={`mt-1 leading-6 ${p.tagline ? "text-slate-700" : muted}`}>{p.tagline || "Your one-line bio appears here."}</p>
        <p className="mt-4 text-sm text-slate-600">{[p.stage, p.country].filter(Boolean).join(", ") || "Stage and country"}</p>
        {p.sectors.length > 0 && <p className="mt-2 text-sm"><span className="font-semibold">Sectors:</span> {p.sectors.join(", ")}</p>}
        {p.looking.length > 0 && <p className="mt-2 text-sm"><mark className="bg-amber-200 px-1.5 py-0.5 font-semibold text-amber-950">Looking for</mark> {p.looking.join(", ")}</p>}
        {p.about && <p className="mt-4 border-t border-slate-200 pt-4 text-sm leading-6 text-slate-700">{p.about}</p>}
      </div>
    </aside>
  </div>;
}