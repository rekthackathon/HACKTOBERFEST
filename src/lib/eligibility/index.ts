import { compiledRequirementsSchema, startupProfileSchema, type CompiledRequirements, type EligibilityEvaluation, type EligibilityRequirement, type StartupProfile } from "@/lib/contracts";

function check(startup: StartupProfile, rule: EligibilityRequirement): { outcome: "pass" | "fail" | "unknown"; reason: string } {
  let passes: boolean;
  switch (rule.kind) {
    case "country": passes = rule.allowed.includes(startup.country); break;
    case "stage": passes = rule.allowed.includes(startup.stage); break;
    case "funding_stage":
      if (startup.fundingStage === null) return { outcome: "unknown", reason: "Funding stage is missing from the startup profile." };
      passes = rule.allowed.includes(startup.fundingStage); break;
    case "company_size_max":
      if (startup.companySize === null) return { outcome: "unknown", reason: "Company size is missing from the startup profile." };
      passes = startup.companySize <= rule.maximum; break;
    case "incorporated_on_or_after":
      if (startup.incorporationDate === null) return { outcome: "unknown", reason: "Incorporation date is missing from the startup profile." };
      passes = startup.incorporationDate >= rule.date; break;
    case "unsupported": return { outcome: "unknown", reason: rule.reason };
  }
  return { outcome: passes ? "pass" : "fail", reason: `${passes ? "Meets" : "Does not meet"} requirement: ${rule.description}` };
}

/** Evaluates validated data only. Model output is data and is never executable. */
export function evaluateEligibility(startupInput: StartupProfile, compilationInput: CompiledRequirements): EligibilityEvaluation {
  const startup = startupProfileSchema.parse(startupInput);
  const compilation = compiledRequirementsSchema.parse(compilationInput);
  const results = compilation.requirements.map((rule) => ({ requirementId: rule.id, ...check(startup, rule), evidence: rule.evidence }));
  const warnings = [...compilation.warnings];
  if (compilation.completeness === "partial") warnings.push("The extracted requirements are incomplete; review the original programme source.");
  if (results.length === 0) warnings.push("No eligibility requirements were extracted.");
  const requiresReview = compilation.completeness !== "complete" || results.length === 0 || warnings.length > 0 || results.some((result) => result.outcome === "unknown");
  return {
    startupId: startup.id,
    opportunityId: compilation.opportunityId,
    status: results.some((result) => result.outcome === "fail") ? "ineligible" : requiresReview ? "needs_review" : "potentially_eligible",
    results,
    warnings,
  };
}
