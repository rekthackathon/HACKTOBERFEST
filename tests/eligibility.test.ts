import { describe, expect, it } from "vitest";
import { evaluateEligibility } from "@/lib/eligibility";
import { mockCompilation, mockStartup } from "@/lib/mocks";
import type { CompiledRequirements, EligibilityRequirement } from "@/lib/contracts";

const evidence = mockCompilation.requirements[0].evidence;
function compilationWith(rule: EligibilityRequirement, extra: Partial<CompiledRequirements> = {}): CompiledRequirements {
  return { ...mockCompilation, requirements: [rule], warnings: [], milestones: [], ...extra };
}

describe("deterministic eligibility", () => {
  it("returns potentially eligible only when all complete supported requirements pass", () => {
    expect(evaluateEligibility(mockStartup, mockCompilation).status).toBe("potentially_eligible");
  });
  it("returns needs review for missing startup data", () => {
    expect(evaluateEligibility({ ...mockStartup, companySize: null }, mockCompilation).status).toBe("needs_review");
  });
  it("never treats no rules or partial extraction as eligible", () => {
    expect(evaluateEligibility(mockStartup, { ...mockCompilation, requirements: [] }).status).toBe("needs_review");
    expect(evaluateEligibility(mockStartup, { ...mockCompilation, completeness: "partial" }).status).toBe("needs_review");
  });
  it("treats warnings and unsupported rules as requiring review", () => {
    expect(evaluateEligibility(mockStartup, { ...mockCompilation, warnings: ["Ambiguous ownership requirement"] }).status).toBe("needs_review");
    expect(evaluateEligibility(mockStartup, { ...mockCompilation, requirements: [{ id: "manual", kind: "unsupported", description: "Local ownership", reason: "Requires manual evidence", evidence: mockCompilation.requirements[0].evidence }] }).status).toBe("needs_review");
  });
  it("lets explicit failures dominate unknown results", () => {
    expect(evaluateEligibility({ ...mockStartup, country: "TH", companySize: null }, mockCompilation).status).toBe("ineligible");
  });
  it("preserves source evidence in each result", () => {
    expect(evaluateEligibility(mockStartup, mockCompilation).results[0].evidence).toEqual(mockCompilation.requirements[0].evidence);
  });
  it("includes the exact employee boundary", () => {
    expect(evaluateEligibility({ ...mockStartup, companySize: 20 }, mockCompilation).status).toBe("potentially_eligible");
    expect(evaluateEligibility({ ...mockStartup, companySize: 21 }, mockCompilation).status).toBe("ineligible");
  });

  it("calculates company age against an explicit evaluation date", () => {
    const compilation = compilationWith({
      id: "age",
      kind: "company_age_max",
      description: "No more than five years old",
      maximumYears: 5,
      evidence,
    });
    expect(evaluateEligibility({ ...mockStartup, incorporationDate: "2021-11-01" }, compilation, { evaluationDate: "2026-10-31" }).status).toBe("potentially_eligible");
    expect(evaluateEligibility({ ...mockStartup, incorporationDate: "2021-10-30" }, compilation, { evaluationDate: "2026-10-31" }).status).toBe("ineligible");
  });

  it("evaluates accumulated revenue above and below RM3 million", () => {
    const compilation = compilationWith({
      id: "revenue",
      kind: "accumulated_revenue_max",
      description: "Accumulated revenue must not exceed RM3 million",
      maximumMyr: 3_000_000,
      evidence,
    });
    expect(evaluateEligibility({ ...mockStartup, accumulatedRevenueMyr: 2_999_999 }, compilation).status).toBe("potentially_eligible");
    expect(evaluateEligibility({ ...mockStartup, accumulatedRevenueMyr: 3_000_001 }, compilation).status).toBe("ineligible");
  });

  it("evaluates the supported Malaysian ownership-or-employees condition conservatively", () => {
    const compilation = compilationWith({
      id: "malaysian-control",
      kind: "malaysian_ownership_or_employees",
      description: "At least 51% Malaysian owned or at least 70% Malaysian employees",
      ownershipMinimumPercent: 51,
      employeeMinimumPercent: 70,
      evidence,
    });
    expect(evaluateEligibility({ ...mockStartup, malaysianOwnershipPercent: 60, malaysianEmployeePercent: 20 }, compilation).status).toBe("potentially_eligible");
    expect(evaluateEligibility({ ...mockStartup, malaysianOwnershipPercent: 40, malaysianEmployeePercent: 75 }, compilation).status).toBe("potentially_eligible");
    expect(evaluateEligibility({ ...mockStartup, malaysianOwnershipPercent: 40, malaysianEmployeePercent: 60 }, compilation).status).toBe("ineligible");
    expect(evaluateEligibility({ ...mockStartup, malaysianOwnershipPercent: 40, malaysianEmployeePercent: null }, compilation).status).toBe("needs_review");
  });

  it("evaluates external entity shareholding limits", () => {
    const compilation = compilationWith({
      id: "external-shareholding",
      kind: "external_entity_shareholding_max",
      description: "No external entity may hold more than 25%",
      maximumPercent: 25,
      evidence,
    });
    expect(evaluateEligibility({ ...mockStartup, largestExternalEntityShareholdingPercent: 25 }, compilation).status).toBe("potentially_eligible");
    expect(evaluateEligibility({ ...mockStartup, largestExternalEntityShareholdingPercent: 25.01 }, compilation).status).toBe("ineligible");
  });

  it("evaluates required IP ownership without treating unknown as false", () => {
    const compilation = compilationWith({ id: "ip", kind: "ip_rights_required", description: "Own the required IP rights", evidence });
    expect(evaluateEligibility({ ...mockStartup, ownsRequiredIpRights: "yes" }, compilation).status).toBe("potentially_eligible");
    expect(evaluateEligibility({ ...mockStartup, ownsRequiredIpRights: "no" }, compilation).status).toBe("ineligible");
    expect(evaluateEligibility({ ...mockStartup, ownsRequiredIpRights: "unknown" }, compilation).status).toBe("needs_review");
  });

  it("evaluates minimum application team size and treats missing information as review", () => {
    const compilation = compilationWith({
      id: "participants",
      kind: "application_team_size_min",
      description: "At least two individuals must participate",
      minimum: 2,
      evidence,
    });
    expect(evaluateEligibility({ ...mockStartup, applicationParticipantCount: 2 }, compilation).status).toBe("potentially_eligible");
    expect(evaluateEligibility({ ...mockStartup, applicationParticipantCount: 1 }, compilation).status).toBe("ineligible");
    expect(evaluateEligibility({ ...mockStartup, applicationParticipantCount: null }, compilation).status).toBe("needs_review");
  });

  it("evaluates AI product and team composition only from explicit structured facts", () => {
    const compilation: CompiledRequirements = {
      ...mockCompilation,
      requirements: [
        { id: "ai-product", kind: "ai_product_required", description: "Has an AI product", evidence },
        { id: "full-time-founders", kind: "full_time_cofounders_required", description: "Has full-time cofounders", evidence },
        { id: "ai-engineers", kind: "dedicated_ai_engineers_required", description: "Has dedicated AI engineers", evidence },
      ],
      warnings: [],
      milestones: [],
    };
    const descriptiveProfile = {
      ...mockStartup,
      description: "An AI startup with full-time founders and dedicated AI engineers.",
      industry: "Artificial intelligence",
      companySize: 50,
      hasAiProduct: "unknown" as const,
      hasFullTimeCofounders: "unknown" as const,
      hasDedicatedAiEngineers: "unknown" as const,
    };
    expect(evaluateEligibility(descriptiveProfile, compilation).status).toBe("needs_review");
    expect(evaluateEligibility({
      ...descriptiveProfile,
      hasAiProduct: "yes",
      hasFullTimeCofounders: "yes",
      hasDedicatedAiEngineers: "yes",
    }, compilation).status).toBe("potentially_eligible");
    expect(evaluateEligibility({
      ...descriptiveProfile,
      hasAiProduct: "yes",
      hasFullTimeCofounders: "yes",
      hasDedicatedAiEngineers: "no",
    }, compilation).status).toBe("ineligible");
  });

  it("excludes post-funding milestones from the eligibility decision", () => {
    const milestone = {
      id: "future-mvp",
      kind: "post_funding_milestone" as const,
      description: "Deliver an MVP by the end of funding",
      evidence,
    };
    const compilation = { ...mockCompilation, milestones: [milestone] };
    const evaluation = evaluateEligibility(mockStartup, compilation);
    expect(evaluation.status).toBe("potentially_eligible");
    expect(evaluation.results.map((result) => result.requirementId)).not.toContain(milestone.id);
  });
});
