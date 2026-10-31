"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { countryLabels, fundingLabels, readApiError, stageLabels } from "@/components/labels";
import { startupProfileInputSchema, type StartupProfile, type StartupProfileInput } from "@/lib/contracts";
const display = "font-[family-name:var(--font-display)]";
const field = "min-h-11 w-full rounded-md border border-slate-400 bg-white px-3 text-base transition-colors duration-150 hover:border-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";
const sectorOptions = ["Agritech", "Fintech", "Healthtech", "Edtech", "Logistics", "Climate", "E-commerce", "AI and data", "Other"];
/** Form state is all strings; it is converted to the contract (codes, numbers, nulls) on save. */
type FormState = { name: string; description: string; industry: string; country: string; stage: string; fundingStage: string; companySize: string; incorporationDate: string };
const empty: FormState = { name: "", description: "", industry: "", country: "", stage: "", fundingStage: "", companySize: "", incorporationDate: "" };
type Status = "loading" | "ready" | "signed-out" | "unavailable";
function fromProfile(p: StartupProfile): FormState {
  return { name: p.name, description: p.description, industry: p.industry, country: p.country, stage: p.stage, fundingStage: p.fundingStage ?? "", companySize: p.companySize === null ? "" : String(p.companySize), incorporationDate: p.incorporationDate ?? "" };
}
function toInput(f: FormState) {
  return startupProfileInputSchema.safeParse({
    name: f.name.trim(),
    description: f.description.trim(),
    industry: f.industry.trim(),
    country: f.country,
    stage: f.stage,
    // Unknown values are null, never "" or 0.
    fundingStage: f.fundingStage || null,
    companySize: f.companySize.trim() === "" ? null : Number(f.companySize),
    incorporationDate: f.incorporationDate || null,
  } satisfies Record<keyof StartupProfileInput, unknown>);
}
function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return <section className="grid gap-x-10 gap-y-4 border-t border-slate-300 py-8 first:border-t-0 first:pt-0 sm:grid-cols-[190px_minmax(0,1fr)]">
    <div><h2 className={`${display} text-lg font-semibold`}>{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{hint}</p></div>
    <div className="space-y-5">{children}</div>
  </section>;
}
export function StartupProfileForm() {
  const [p, setP] = useState<FormState>(empty);
  const [status, setStatus] = useState<Status>("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setP(prev => ({ ...prev, [key]: value }));
  useEffect(() => {
    let active = true;
    fetch("/api/startups/me", { cache: "no-store" }).then(async response => {
      if (!active) return;
      if (response.ok) {
        const body = await response.json() as { data: StartupProfile };
        setP(fromProfile(body.data));
        setStatus("ready");
      } else if (response.status === 404) setStatus("ready");
      else if (response.status === 401) setStatus("signed-out");
      else { setError(await readApiError(response, "Your profile could not be loaded.")); setStatus("unavailable"); }
    }).catch(() => { if (active) { setError("Your profile could not be loaded."); setStatus("unavailable"); } });
    return () => { active = false; };
  }, []);
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    const parsed = toInput(p);
    if (!parsed.success) {
      const missing = [!p.name.trim() && "startup name", !p.description.trim() && "description", !p.industry && "sector", !p.country && "country", !p.stage && "stage"].filter(Boolean);
      return setError(missing.length ? `Add your ${missing.join(", ")}.` : "Check the team size (a whole number of at least 1) and the incorporation date.");
    }
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/startups/me", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      if (response.status === 401) return setStatus("signed-out");
      if (!response.ok) return setError(await readApiError(response, "Your profile could not be saved."));
      const body = await response.json() as { data: StartupProfile };
      setP(fromProfile(body.data));
      setNotice("Profile saved.");
    } catch {
      setError("Your profile could not be saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }
  if (status === "loading") return <p role="status" className="text-slate-600">Loading your profile…</p>;
  if (status === "signed-out") return <div className="rounded-lg border border-slate-300 bg-white p-6">
    <p className="text-slate-700">Log in to create and save your startup profile.</p>
    <Button asChild className="mt-4"><Link href="/auth">Log in or create an account</Link></Button>
  </div>;
  if (status === "unavailable") return <p role="alert" className="border-l-4 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>;
  const initials = p.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "S";
  const muted = "text-slate-500";
  const facts = [p.stage && stageLabels[p.stage as StartupProfileInput["stage"]], p.country && countryLabels[p.country as StartupProfileInput["country"]], p.fundingStage && fundingLabels[p.fundingStage as keyof typeof fundingLabels]].filter(Boolean);
  return <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
    <form onSubmit={onSubmit} noValidate>
      <Section title="Basics" hint="The first thing people and matches see.">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-semibold">Startup name</label>
          <input id="name" value={p.name} maxLength={160} onChange={e => set("name", e.target.value)} autoComplete="organization" className={field} />
        </div>
        <div>
          <label htmlFor="about" className="mb-1.5 block text-sm font-semibold">About your startup</label>
          <textarea id="about" rows={5} value={p.description} maxLength={4000} onChange={e => set("description", e.target.value)} aria-describedby="about-count" className={`${field} py-2.5`} />
          <p id="about-count" className="mt-1.5 text-sm text-slate-600">{p.description.length} of 4000 characters</p>
        </div>
      </Section>
      <Section title="Focus" hint="Where you are and what you build. Eligibility checks read these fields.">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="country" className="mb-1.5 block text-sm font-semibold">Based in</label>
            <select id="country" value={p.country} onChange={e => set("country", e.target.value)} className={field}><option value="">Choose a country</option>{Object.entries(countryLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>
          </div>
          <div>
            <label htmlFor="industry" className="mb-1.5 block text-sm font-semibold">Sector</label>
            <select id="industry" value={p.industry} onChange={e => set("industry", e.target.value)} className={field}><option value="">Choose a sector</option>{[...new Set([...sectorOptions, ...(p.industry ? [p.industry] : [])])].map(s => <option key={s} value={s}>{s}</option>)}</select>
          </div>
          <div>
            <label htmlFor="stage" className="mb-1.5 block text-sm font-semibold">Product stage</label>
            <select id="stage" value={p.stage} onChange={e => set("stage", e.target.value)} className={field}><option value="">Choose a stage</option>{Object.entries(stageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>
          <div>
            <label htmlFor="funding" className="mb-1.5 block text-sm font-semibold">Funding stage</label>
            <select id="funding" value={p.fundingStage} onChange={e => set("fundingStage", e.target.value)} className={field}><option value="">Not sure</option>{Object.entries(fundingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>
        </div>
      </Section>
      <Section title="Company" hint="Optional. Leave blank if unknown; checks then mark the rule for review.">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="size" className="mb-1.5 block text-sm font-semibold">Team size</label>
            <input id="size" type="number" inputMode="numeric" min={1} step={1} value={p.companySize} onChange={e => set("companySize", e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="incorporated" className="mb-1.5 block text-sm font-semibold">Incorporation date</label>
            <input id="incorporated" type="date" value={p.incorporationDate} onChange={e => set("incorporationDate", e.target.value)} className={field} />
          </div>
        </div>
      </Section>
      <div className="space-y-4 border-t border-slate-300 pt-8">
        {error && <p role="alert" className="border-l-4 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}
        {notice && <p role="status" className="bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900">{notice} <Link href="/opportunities" className="underline underline-offset-4">Check opportunities</Link></p>}
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button>
      </div>
    </form>
    <aside aria-label="Profile preview" className="lg:sticky lg:top-6">
      <p className="mb-3 text-sm font-semibold text-slate-700">How your profile reads</p>
      <div className="rounded-lg border border-slate-300 bg-white p-6">
        <div className="grid size-16 place-items-center rounded-full bg-teal-800 text-xl font-bold text-white" aria-hidden="true">{initials}</div>
        <h2 className={`${display} mt-4 text-xl font-semibold leading-snug ${p.name ? "" : muted}`}>{p.name || "Your startup name"}</h2>
        <p className="mt-4 text-sm text-slate-600">{facts.join(", ") || "Stage and country"}</p>
        {p.industry && <p className="mt-2 text-sm"><span className="font-semibold">Sector:</span> {p.industry}</p>}
        {p.description && <p className="mt-4 border-t border-slate-200 pt-4 text-sm leading-6 text-slate-700">{p.description}</p>}
      </div>
    </aside>
  </div>;
}
