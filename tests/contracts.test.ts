import { describe, expect, it } from "vitest";
import { compiledRequirementsSchema, opportunitySchema, startupProfileInputSchema } from "@/lib/contracts";
import { mockCompilation, mockOpportunities, mockStartup } from "@/lib/mocks";

describe("shared contracts", () => {
  it("accepts the documented fictional fixtures", () => {
    expect(opportunitySchema.parse(mockOpportunities[0]).isMock).toBe(true);
    expect(compiledRequirementsSchema.safeParse(mockCompilation).success).toBe(true);
  });
  it("rejects client-supplied ownership in profile writes", () => {
    expect(startupProfileInputSchema.safeParse(mockStartup).success).toBe(false);
  });
  it("rejects invalid dates, employee counts, and insecure source URLs", () => {
    const { id, ownerId, createdAt, updatedAt, ...input } = mockStartup;
    void [id, ownerId, createdAt, updatedAt];
    expect(startupProfileInputSchema.safeParse({ ...input, incorporationDate: "2026-02-30" }).success).toBe(false);
    expect(startupProfileInputSchema.safeParse({ ...input, companySize: -1 }).success).toBe(false);
    expect(opportunitySchema.safeParse({ ...mockOpportunities[0], applicationUrl: "javascript:alert(1)" }).success).toBe(false);
  });
  it("rejects executable or unsupported rule shapes and duplicate IDs", () => {
    expect(compiledRequirementsSchema.safeParse({ ...mockCompilation, requirements: [{ kind: "javascript", code: "return true" }] }).success).toBe(false);
    expect(compiledRequirementsSchema.safeParse({ ...mockCompilation, requirements: [mockCompilation.requirements[0], mockCompilation.requirements[0]] }).success).toBe(false);
  });
  it("requires source evidence for every compiled requirement", () => {
    expect(compiledRequirementsSchema.safeParse({ ...mockCompilation, requirements: [{ ...mockCompilation.requirements[0], evidence: undefined }] }).success).toBe(false);
  });
});
