import { compiledRequirementsSchema, startupProfileSchema, type CompiledRequirements, type EligibilityEvaluation, type EligibilityRequirement, type StartupProfile } from "@/lib/contracts";

function companyAgeCutoff(evaluationDate: string, maximumYears: number): string {
  const cutoff = new Date(`${evaluationDate}T00:00:00.000Z`);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - maximumYears);
  return cutoff.toISOString().slice(0, 10);
}

function check(startup: StartupProfile, rule: EligibilityRequirement, evaluationDate: string): { outcome: "pass" | "fail" | "unknown"; reason: string } {
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
    case "company_age_max":
      if (startup.incorporationDate === null) return { outcome: "unknown", reason: "Incorporation date is missing from the startup profile." };
      passes = startup.incorporationDate >= companyAgeCutoff(evaluationDate, rule.maximumYears); break;
    case "accumulated_revenue_max":
      if (startup.accumulatedRevenueMyr === null) return { outcome: "unknown", reason: "Accumulated company revenue is missing from the startup profile." };
      passes = startup.accumulatedRevenueMyr <= rule.maximumMyr; break;
    case "malaysian_ownership_min":
      if (startup.malaysianOwnershipPercent === null) return { outcome: "unknown", reason: "Malaysian ownership percentage is missing from the startup profile." };
      passes = startup.malaysianOwnershipPercent >= rule.minimumPercent; break;
    case "malaysian_employees_min":
      if (startup.malaysianEmployeePercent === null) return { outcome: "unknown", reason: "Percentage of Malaysian employees is missing from the startup profile." };
      passes = startup.malaysianEmployeePercent >= rule.minimumPercent; break;
    case "malaysian_ownership_or_employees": {
      const ownership = startup.malaysianOwnershipPercent;
      const employees = startup.malaysianEmployeePercent;
      if (ownership !== null && ownership >= rule.ownershipMinimumPercent) passes = true;
      else if (employees !== null && employees >= rule.employeeMinimumPercent) passes = true;
      else if (ownership === null || employees === null) {
        return { outcome: "unknown", reason: "Malaysian ownership or employee-nationality information is incomplete." };
      } else passes = false;
      break;
    }
    case "external_entity_shareholding_max":
      if (startup.largestExternalEntityShareholdingPercent === null) return { outcome: "unknown", reason: "Largest external entity shareholding is missing from the startup profile." };
      passes = startup.largestExternalEntityShareholdingPercent <= rule.maximumPercent; break;
    case "ip_rights_required":
      if (startup.ownsRequiredIpRights === "unknown") return { outcome: "unknown", reason: "Required IP-rights ownership is unknown." };
      passes = startup.ownsRequiredIpRights === "yes"; break;
    case "application_team_size_min":
      if (startup.applicationParticipantCount === null) return { outcome: "unknown", reason: "Application participant count is missing from the startup profile." };
      passes = startup.applicationParticipantCount >= rule.minimum; break;
    case "ai_product_required":
      if (startup.hasAiProduct === "unknown") return { outcome: "unknown", reason: "Whether the startup has an AI product is unknown." };
      passes = startup.hasAiProduct === "yes"; break;
    case "full_time_cofounders_required":
      if (startup.hasFullTimeCofounders === "unknown") return { outcome: "unknown", reason: "Whether the startup has full-time cofounders is unknown." };
      passes = startup.hasFullTimeCofounders === "yes"; break;
    case "dedicated_ai_engineers_required":
      if (startup.hasDedicatedAiEngineers === "unknown") return { outcome: "unknown", reason: "Whether the startup has dedicated AI engineers is unknown." };
      passes = startup.hasDedicatedAiEngineers === "yes"; break;
    case "individual_applicant_residency":
      if (startup.individualApplicantStatus === "unknown") return { outcome: "unknown", reason: "Individual applicant residency eligibility is unknown." };
      passes = startup.individualApplicantStatus === "eligible" || startup.individualApplicantStatus === "not_applicable"; break;
    case "unsupported": return { outcome: "unknown", reason: rule.reason };
  }
  return { outcome: passes ? "pass" : "fail", reason: `${passes ? "Meets" : "Does not meet"} requirement: ${rule.description}` };
}

/** Evaluates validated data only. Model output is data and is never executable. */
export function evaluateEligibility(startupInput: StartupProfile, compilationInput: CompiledRequirements, options: { evaluationDate?: string } = {}): EligibilityEvaluation {
  const startup = startupProfileSchema.parse(startupInput);
  const compilation = compiledRequirementsSchema.parse(compilationInput);
  const evaluationDate = options.evaluationDate ?? compilation.compiledAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(evaluationDate) || Number.isNaN(Date.parse(`${evaluationDate}T00:00:00.000Z`))) {
    throw new Error("Evaluation date must use YYYY-MM-DD.");
  }
  const results = compilation.requirements.map((rule) => ({ requirementId: rule.id, ...check(startup, rule, evaluationDate), evidence: rule.evidence }));
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
