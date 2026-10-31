import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { StartupProfileForm } from "@/components/startup-profile-form";

export const metadata: Metadata = { title: "My startup | ASEAN Connect" };

export default function StartupsPage() {
  return <SiteShell active="My startup">
    <h1 className="max-w-2xl font-[family-name:var(--font-display)] text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">Your startup profile</h1>
    <p className="mb-10 mt-5 max-w-xl text-lg leading-8 text-slate-700">Tell us who you are and what you need. Recommendations read this profile. Foundation preview: saving is not connected yet.</p>
    <StartupProfileForm />
  </SiteShell>;
}