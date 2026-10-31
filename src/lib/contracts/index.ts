import { z } from "zod";

export const countrySchema = z.enum(["BN", "KH", "ID", "LA", "MY", "MM", "PH", "SG", "TH", "TL", "VN"]);
export const startupStageSchema = z.enum(["idea", "prototype", "mvp", "growth", "scale"]);
export const fundingStageSchema = z.enum(["bootstrapped", "pre_seed", "seed", "series_a", "series_b", "series_b_plus"]);
export const yesNoUnknownSchema = z.enum(["yes", "no", "unknown"]);
export const ipRightsStatusSchema = yesNoUnknownSchema;
export const individualApplicantStatusSchema = z.enum(["eligible", "ineligible", "not_applicable", "unknown"]);
const dateSchema = z.iso.date();
const httpsUrlSchema = z.url().refine((value) => value.startsWith("https://"), "Use an HTTPS source URL");
const optionalPercentSchema = z.number().min(0).max(100).nullable().default(null);

export const startupProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4000),
  industry: z.string().trim().min(1).max(120),
  country: countrySchema,
  stage: startupStageSchema,
  incorporationDate: dateSchema.nullable(),
  companySize: z.number().int().min(1).max(1000000).nullable(),
  fundingStage: fundingStageSchema.nullable(),
  accumulatedRevenueMyr: z.number().nonnegative().max(1_000_000_000_000_000).nullable().default(null),
  malaysianOwnershipPercent: optionalPercentSchema,
  malaysianEmployeePercent: optionalPercentSchema,
  largestExternalEntityShareholdingPercent: optionalPercentSchema,
  ownsRequiredIpRights: ipRightsStatusSchema.default("unknown"),
  applicationParticipantCount: z.number().int().min(1).max(1_000_000).nullable().default(null),
  hasAiProduct: yesNoUnknownSchema.default("unknown"),
  hasFullTimeCofounders: yesNoUnknownSchema.default("unknown"),
  hasDedicatedAiEngineers: yesNoUnknownSchema.default("unknown"),
  individualApplicantStatus: individualApplicantStatusSchema.default("unknown"),
}).strict();

export const startupProfileSchema = startupProfileInputSchema.extend({
  id: z.uuid(),
  ownerId: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const sourceEvidenceSchema = z.object({
  sourceUrl: httpsUrlSchema,
  quote: z.string().trim().min(1).max(4000),
  locator: z.string().trim().min(1).max(200),
  retrievedAt: z.iso.datetime(),
}).strict();

export const opportunitySchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(8000),
  kind: z.enum(["grant", "accelerator", "incubator", "hackathon", "funding", "partnership"]),
  countries: z.array(countrySchema).min(1),
  deadline: z.iso.datetime().nullable(),
  applicationUrl: httpsUrlSchema,
  sourceText: z.string().trim().min(1).max(100000),
  evidence: z.array(sourceEvidenceSchema).min(1),
  isMock: z.boolean().default(false),
}).strict();

const ruleBase = {
  id: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(1000),
  evidence: sourceEvidenceSchema,
};

export const eligibilityRequirementSchema = z.discriminatedUnion("kind", [
  z.object({ ...ruleBase, kind: z.literal("country"), allowed: z.array(countrySchema).min(1) }).strict(),
  z.object({ ...ruleBase, kind: z.literal("stage"), allowed: z.array(startupStageSchema).min(1) }).strict(),
  z.object({ ...ruleBase, kind: z.literal("funding_stage"), allowed: z.array(fundingStageSchema).min(1) }).strict(),
  z.object({ ...ruleBase, kind: z.literal("company_size_max"), maximum: z.number().int().positive() }).strict(),
  z.object({ ...ruleBase, kind: z.literal("incorporated_on_or_after"), date: dateSchema }).strict(),
  z.object({ ...ruleBase, kind: z.literal("company_age_max"), maximumYears: z.number().int().positive().max(200) }).strict(),
  z.object({ ...ruleBase, kind: z.literal("accumulated_revenue_max"), maximumMyr: z.number().nonnegative() }).strict(),
  z.object({ ...ruleBase, kind: z.literal("malaysian_ownership_min"), minimumPercent: z.number().min(0).max(100) }).strict(),
  z.object({ ...ruleBase, kind: z.literal("malaysian_employees_min"), minimumPercent: z.number().min(0).max(100) }).strict(),
  z.object({
    ...ruleBase,
    kind: z.literal("malaysian_ownership_or_employees"),
    ownershipMinimumPercent: z.number().min(0).max(100),
    employeeMinimumPercent: z.number().min(0).max(100),
  }).strict(),
  z.object({ ...ruleBase, kind: z.literal("external_entity_shareholding_max"), maximumPercent: z.number().min(0).max(100) }).strict(),
  z.object({ ...ruleBase, kind: z.literal("ip_rights_required") }).strict(),
  z.object({ ...ruleBase, kind: z.literal("application_team_size_min"), minimum: z.number().int().positive().max(1_000_000) }).strict(),
  z.object({ ...ruleBase, kind: z.literal("ai_product_required") }).strict(),
  z.object({ ...ruleBase, kind: z.literal("full_time_cofounders_required") }).strict(),
  z.object({ ...ruleBase, kind: z.literal("dedicated_ai_engineers_required") }).strict(),
  z.object({ ...ruleBase, kind: z.literal("individual_applicant_residency") }).strict(),
  z.object({ ...ruleBase, kind: z.literal("unsupported"), reason: z.string().trim().min(1).max(1000) }).strict(),
]);

export const postFundingMilestoneSchema = z.object({
  ...ruleBase,
  kind: z.literal("post_funding_milestone"),
}).strict();

export const compiledRequirementsSchema = z.object({
  opportunityId: z.uuid(),
  model: z.string().trim().min(1),
  compiledAt: z.iso.datetime(),
  completeness: z.enum(["complete", "partial"]),
  requirements: z.array(eligibilityRequirementSchema).max(100),
  milestones: z.array(postFundingMilestoneSchema).max(100).default([]),
  warnings: z.array(z.string().trim().min(1).max(1000)).max(100),
}).strict().superRefine((value, context) => {
  const ids = [...value.requirements, ...value.milestones].map((rule) => rule.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Requirement IDs must be unique", path: ["requirements"] });
});

export const eligibilityEvaluationSchema = z.object({
  startupId: z.uuid(),
  opportunityId: z.uuid(),
  status: z.enum(["potentially_eligible", "ineligible", "needs_review"]),
  results: z.array(z.object({
    requirementId: z.string(),
    outcome: z.enum(["pass", "fail", "unknown"]),
    reason: z.string(),
    evidence: sourceEvidenceSchema,
  }).strict()),
  warnings: z.array(z.string()),
}).strict();

export const apiErrorSchema = z.object({ error: z.object({
  code: z.enum(["VALIDATION_ERROR", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "NOT_CONFIGURED", "RATE_LIMITED", "AI_UNAVAILABLE", "INTERNAL_ERROR"]),
  message: z.string().min(1),
  requestId: z.uuid().optional(),
}).strict() }).strict();

export type StartupProfileInput = z.infer<typeof startupProfileInputSchema>;
export type StartupProfile = z.infer<typeof startupProfileSchema>;
export type Opportunity = z.infer<typeof opportunitySchema>;
export type SourceEvidence = z.infer<typeof sourceEvidenceSchema>;
export type EligibilityRequirement = z.infer<typeof eligibilityRequirementSchema>;
export type PostFundingMilestone = z.infer<typeof postFundingMilestoneSchema>;
export type CompiledRequirements = z.infer<typeof compiledRequirementsSchema>;
export type EligibilityEvaluation = z.infer<typeof eligibilityEvaluationSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
