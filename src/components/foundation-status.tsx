import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";

export function FoundationStatus({ title, description, items, active }: { title: string; description: string; items: string[]; active?: string }) {
  return <SiteShell active={active}><section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-7 sm:p-10"><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Foundation preview · Not connected</span><h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-4 text-sm leading-7 text-slate-600">{description}</p><ul className="my-6 space-y-3 text-sm text-slate-600">{items.map(item => <li key={item} className="flex gap-3"><span aria-hidden="true" className="text-teal-700">○</span>{item}</li>)}</ul><Button asChild><Link href="/dashboard">Back to discovery</Link></Button></section></SiteShell>;
}
