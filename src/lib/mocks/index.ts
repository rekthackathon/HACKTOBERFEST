import { compiledRequirementsSchema, opportunitySchema, startupProfileSchema } from "@/lib/contracts";

// Fictional fixtures only. These are not real programmes, application links, or eligibility advice.
const evidence = {
  sourceUrl: "https://example.com/fictional-asean-launchpad",
  quote: "Fictional demo programme: startups based in Malaysia or Singapore with no more than 20 employees may apply.",
  locator: "Demo requirements paragraph",
  retrievedAt: "2026-10-31T00:00:00Z",
};

export const mockStartup = startupProfileSchema.parse({
  id: "00000000-0000-4000-8000-000000000001",
  ownerId: "00000000-0000-4000-8000-000000000002",
  name: "Rantau Labs (demo)",
  description: "A fictional Malaysian startup building tools for regional collaboration.",
  industry: "Developer tools",
  country: "MY",
  stage: "mvp",
  incorporationDate: "2025-03-01",
  companySize: 8,
  fundingStage: "bootstrapped",
  createdAt: "2026-10-31T00:00:00Z",
  updatedAt: "2026-10-31T00:00:00Z",
});

export const mockOpportunities = [opportunitySchema.parse({
  id: "00000000-0000-4000-8000-000000000003",
  title: "ASEAN Launchpad — fictional demo",
  description: "A fictional accelerator used to develop and test the opportunity interface.",
  kind: "accelerator",
  countries: ["MY", "SG"],
  deadline: null,
  applicationUrl: evidence.sourceUrl,
  sourceText: evidence.quote,
  evidence: [evidence],
  isMock: true,
})];

export const mockCompilation = compiledRequirementsSchema.parse({
  opportunityId: mockOpportunities[0].id,
  model: "fixture-no-model-invoked",
  compiledAt: "2026-10-31T00:00:00Z",
  completeness: "complete",
  requirements: [
    { id: "country", kind: "country", description: "Based in Malaysia or Singapore", allowed: ["MY", "SG"], evidence },
    { id: "size", kind: "company_size_max", description: "No more than 20 employees", maximum: 20, evidence },
  ],
  warnings: [],
});
