"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

type Mode = "login" | "signup";

const display = "font-[family-name:var(--font-display)]";
const input = "min-h-11 w-full rounded-md border border-slate-400 bg-white px-3 text-base transition-colors duration-150 hover:border-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";
const textLink = "min-h-11 px-1 text-sm font-semibold text-teal-800 underline underline-offset-4 transition-all duration-150 hover:text-teal-950 hover:underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";
const strengthLabels = ["Too short", "Weak", "Okay", "Strong"];

function strength(p: string) {
  if (p.length < 8) return 0;
  const points = Number(p.length >= 12) + Number(/[a-z]/i.test(p) && /\d/.test(p)) + Number(/[^a-z0-9]/i.test(p));
  return Math.max(1, Math.min(3, points));
}

export function AuthForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const level = strength(password);

  function switchMode(next: Mode) {
    setMode(next);
    setErrors([]);
    setNotice("");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();

    const found: string[] = [];
    if (mode === "signup" && !name) found.push("Enter your name.");
    if (!email.includes("@")) found.push("Enter a valid email address.");
    if (password.length < 8) found.push("Use a password with at least 8 characters.");
    setErrors(found);
    if (found.length) return setNotice("");

    // TODO (backend): call the Supabase auth helper here.
    //   signup -> create the account with email and password
    //   login  -> sign in with email and password
    // Until then nothing is sent anywhere.
    setNotice("Accounts are not connected yet, so your details were not sent anywhere.");
  }

  return <div className="rounded-lg border border-slate-300 bg-white p-6 sm:p-8">
    <div role="group" aria-label="Choose login or sign up" className="relative grid grid-cols-2 border-b border-slate-300">
      <span aria-hidden="true" className="absolute bottom-0 left-0 h-1 w-1/2 bg-amber-400 transition-transform duration-300 ease-out motion-reduce:transition-none" style={{ transform: mode === "signup" ? "translateX(100%)" : "translateX(0)" }} />
      {([["login", "Log in"], ["signup", "Create account"]] as const).map(([value, label]) => (
        <button key={value} type="button" aria-pressed={mode === value} onClick={() => switchMode(value)}
          className={`min-h-11 pb-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${mode === value ? "text-slate-900" : "text-slate-600 hover:text-slate-900"}`}>
          {label}
        </button>
      ))}
    </div>

    <h2 className={`${display} mt-6 text-2xl font-semibold tracking-tight`}>{mode === "login" ? "Welcome back" : "Create your account"}</h2>

    <form onSubmit={onSubmit} noValidate className="mt-5 space-y-5">
      {mode === "signup" && <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-semibold">Your name</label>
        <input id="name" name="name" type="text" autoComplete="name" className={input} />
      </div>}
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" className={input} />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-semibold">Password</label>
          <button type="button" aria-pressed={showPassword} onClick={() => setShowPassword(s => !s)} className={textLink}>{showPassword ? "Hide" : "Show"}</button>
        </div>
        <input id="password" name="password" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} className={input} />
        {mode === "signup" && <div className="mt-2" aria-live="polite">
          <div className="flex gap-1.5" aria-hidden="true">{[1, 2, 3].map(n => <span key={n} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${password && level >= n ? "bg-teal-700" : "bg-slate-200"}`} />)}</div>
          <p className="mt-1.5 text-sm text-slate-600">{password ? `Strength: ${strengthLabels[level]}` : "Use at least 8 characters."}</p>
        </div>}
        {mode === "login" && <button type="button" onClick={() => { setErrors([]); setNotice("Password reset is not connected yet."); }} className={`${textLink} mt-1 -ml-1`}>Forgot password?</button>}
      </div>

      {errors.length > 0 && <ul role="alert" className="space-y-1 border-l-4 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
      {notice && <p role="status" className="bg-amber-200 px-3 py-2 text-sm font-semibold text-amber-950">{notice}</p>}

      <Button type="submit" className="w-full">{mode === "login" ? "Log in" : "Create account"}</Button>
    </form>
  </div>;
}