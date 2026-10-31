"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { countryLabels, kindLabels, outcomeLabels, readApiError, statusLabels } from "@/components/labels";
import type { CompiledRequirements, EligibilityEvaluation, Opportunity } from "@/lib/contracts";
const display = "font-[family-name:var(--font-display)]";
type Check =
  | { state: "running" }
  | { state: "error"; message: string; status: number }
  | { state: "done"; evaluation: EligibilityEvaluation; compilation: CompiledRequirements };
function countriesText(codes: Opportunity["countries"]) {
  return codes.length === Object.keys(countryLabels).length ? "All ASEAN countries" : codes.map(c => countryLabels[c]).join(", ");
}
function Result({ check }: { check: Extract<Check, { state: "done" }> }) {
  const { evaluation, compilation } = check;
  const status = statusLabels[evaluation.status];
  const descriptions = new Map(compilation.requirements.map(r => [r.id, r.description]));
  return <div className="mt-5 rounded-lg border border-slate-300 bg-slate-50 p-5" aria-live="polite">
    <div className="flex flex-wrap items-center gap-3">
      <span className={`rounded-full px-3 py-1 text-sm font-bold ${status.className}`}>{status.label}</span>
      <span className="text-sm text-slate-600">Extracted by <span className="font-semibold">{compilation.model}</span>, checked by deterministic rules{compilation.completeness === "partial" ? ", extraction incomplete" : ""}.</span>
    </div>
    {evaluation.results.length === 0 && <p className="mt-4 text-sm text-slate-700">No checkable requirements were extracted. Review the official source.</p>}
    <ol className="mt-4 space-y-4">
      {evaluation.results.map(result => {
        const outcome = outcomeLabels[result.outcome];
        return <li key={result.requirementId} className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start gap-2">
            <span className={`shrink-0 rounded border px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${outcome.className}`}>{outcome.label}</span>
            <p className="text-sm font-semibold text-slate-900">{descriptions.get(result.requirementId)}</p>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{result.reason}</p>
          <blockquote className="mt-3 border-l-4 border-slate-300 pl-3 text-sm italic leading-6 text-slate-700">&ldquo;{result.evidence.quote}&rdquo;</blockquote>
          <p className="mt-1 text-xs text-slate-600">Source: <a href={result.evidence.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-800 underline underline-offset-2">{result.evidence.locator}</a>, retrieved {result.evidence.retrievedAt.slice(0, 10)}</p>
        </li>;
      })}
    </ol>
    {evaluation.warnings.length > 0 && <ul className="mt-4 space-y-1 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">{evaluation.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
    <p className="mt-4 text-xs text-slate-600">This is a screening aid, not an application decision. Confirm every requirement with the official programme source.</p>
  </div>;
}
export function OpportunityList() {
  const [items, setItems] = useState<Opportunity[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [checks, setChecks] = useState<Record<string, Check>>({});
  useEffect(() => {
    let active = true;
    fetch("/api/opportunities", { cache: "no-store" }).then(async response => {
      if (!active) return;
      if (!response.ok) return setLoadError(await readApiError(response, "Opportunities could not be loaded."));
      const body = await response.json() as { data: Opportunity[] };
      setItems(body.data);
    }).catch(() => { if (active) setLoadError("Opportunities could not be loaded."); });
    return () => { active = false; };
  }, []);
  async function check(id: string) {
    setChecks(prev => ({ ...prev, [id]: { state: "running" } }));
    try {
      const response = await fetch("/api/eligibility/evaluate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opportunityId: id }) });
      if (!response.ok) {
        const message = await readApiError(response, "The eligibility check failed. Try again.");
        return setChecks(prev => ({ ...prev, [id]: { state: "error", message, status: response.status } }));
      }
      const body = await response.json() as { data: { evaluation: EligibilityEvaluation; compilation: CompiledRequirements } };
      setChecks(prev => ({ ...prev, [id]: { state: "done", ...body.data } }));
    } catch {
      setChecks(prev => ({ ...prev, [id]: { state: "error", message: "The eligibility check failed. Check your connection and try again.", status: 0 } }));
    }
  }
  if (loadError) return <p role="alert" className="border-l-4 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900">{loadError}</p>;
  if (!items) return <p role="status" className="text-slate-600">Loading opportunities…</p>;
  if (items.length === 0) return <p className="text-slate-700">No opportunities have been published yet.</p>;
  return <ol className="space-y-6">
    {items.map(item => {
      const current = checks[item.id];
      return <li key={item.id} className="rounded-lg border border-slate-300 bg-white p-6">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600"><span className="font-semibold text-slate-900">{kindLabels[item.kind]}</span><span>{countriesText(item.countries)}</span>{item.deadline && <span>Closes {item.deadline.slice(0, 10)}</span>}</div>
        <h2 className={`${display} mt-2 text-2xl font-semibold leading-snug`}>{item.title}</h2>
        <p className="mt-2 max-w-prose leading-7 text-slate-700">{item.description}</p>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-teal-800">Official eligibility text ({item.evidence.length} quoted)</summary>
          <ul className="mt-2 space-y-2">{item.evidence.map(e => <li key={e.quote}><blockquote className="border-l-4 border-slate-300 pl-3 italic leading-6 text-slate-700">&ldquo;{e.quote}&rdquo;</blockquote></li>)}</ul>
        </details>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => check(item.id)} disabled={current?.state === "running"}>{current?.state === "running" ? "Checking with Gemma…" : current?.state === "done" ? "Check again" : "Check my eligibility"}</Button>
          <a href={item.applicationUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-teal-800 underline underline-offset-4">Official programme page</a>
        </div>
        {current?.state === "running" && <p role="status" className="mt-3 text-sm text-slate-600">Reading the official requirements. This can take up to a minute.</p>}
        {current?.state === "error" && <p role="alert" className="mt-3 border-l-4 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900">{current.message}{current.status === 401 && <> <Link href="/auth" className="font-semibold underline">Log in</Link></>}{current.status === 404 && <> <Link href="/startups" className="font-semibold underline">Go to My startup</Link></>}</p>}
        {current?.state === "done" && <Result check={current} />}
      </li>;
    })}
  </ol>;
}
