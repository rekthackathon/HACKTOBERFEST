import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { OpportunityList } from "@/components/opportunity-list";

export const metadata: Metadata = { title: "Opportunities | ASEAN Connect" };

export default function Opportunities() {
  return <SiteShell active="Opportunities">
    <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">Real programmes, checked against your profile.</h1>
    <p className="mb-10 mt-5 max-w-xl text-lg leading-8 text-slate-700">Each programme is curated from its official page. Gemma 4 extracts the requirements with exact quotes, then fixed rules compare them with your saved startup profile. Anything unclear is marked for review.</p>
    <OpportunityList />
  </SiteShell>;
}
