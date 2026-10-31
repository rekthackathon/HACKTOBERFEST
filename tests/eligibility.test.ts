import { describe, expect, it } from "vitest";
import { evaluateEligibility } from "@/lib/eligibility";
import { mockCompilation, mockStartup } from "@/lib/mocks";

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
});
