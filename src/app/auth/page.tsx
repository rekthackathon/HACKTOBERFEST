import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Account setup | ASEAN Connect" };

export default function AuthPage() {
  return <SiteShell active="">
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start">
      <section>
        <h1 className="max-w-xl font-[family-name:var(--font-display)] text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">Keep what you find.</h1>
        <p className="mt-5 max-w-lg text-lg leading-8 text-slate-700">An account holds your startup profile and the opportunities you save, so the next visit starts where you stopped.</p>
        <p className="mt-6 max-w-lg text-sm leading-6 text-slate-600">Foundation preview: accounts are not connected yet, so nothing you type here is stored or sent.</p>
      </section>
      <AuthForm />
    </div>
  </SiteShell>;
}