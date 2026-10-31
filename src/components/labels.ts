import type { EligibilityEvaluation, Opportunity, StartupProfileInput } from "@/lib/contracts";

/** Display labels for contract enum values. The API always receives the codes, never these labels. */
export const countryLabels: Record<StartupProfileInput["country"], string> = {
  BN: "Brunei", KH: "Cambodia", ID: "Indonesia", LA: "Laos", MY: "Malaysia", MM: "Myanmar",
  PH: "Philippines", SG: "Singapore", TH: "Thailand", TL: "Timor-Leste", VN: "Vietnam",
};

export const stageLabels: Record<StartupProfileInput["stage"], string> = {
  idea: "Idea", prototype: "Prototype", mvp: "MVP", growth: "Growth", scale: "Scale",
};

export const fundingLabels: Record<NonNullable<StartupProfileInput["fundingStage"]>, string> = {
  bootstrapped: "Bootstrapped", pre_seed: "Pre-seed", seed: "Seed", series_a: "Series A", series_b: "Series B", series_b_plus: "Later than Series B",
};

export const kindLabels: Record<Opportunity["kind"], string> = {
  grant: "Grant", accelerator: "Accelerator", incubator: "Incubator", hackathon: "Hackathon", funding: "Funding", partnership: "Partnership",
};

export const statusLabels: Record<EligibilityEvaluation["status"], { label: string; className: string }> = {
  potentially_eligible: { label: "Potentially eligible", className: "bg-teal-800 text-white" },
  ineligible: { label: "Not eligible", className: "bg-red-800 text-white" },
  needs_review: { label: "Needs review", className: "bg-amber-300 text-amber-950" },
};

export const outcomeLabels: Record<EligibilityEvaluation["results"][number]["outcome"], { label: string; className: string }> = {
  pass: { label: "Meets", className: "border-teal-800 text-teal-900" },
  fail: { label: "Does not meet", className: "border-red-800 text-red-900" },
  unknown: { label: "Needs review", className: "border-amber-600 text-amber-950" },
};

/** Reads a contract error envelope without trusting its shape. */
export async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    const message = (body as { error?: { message?: unknown } })?.error?.message;
    return typeof message === "string" && message ? message : fallback;
  } catch {
    return fallback;
  }
}
