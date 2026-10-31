import { opportunitySchema, startupProfileSchema, type Opportunity, type StartupProfile, type StartupProfileInput } from "@/lib/contracts";

/** Database rows use snake_case; API contracts use camelCase. Map explicitly in both directions. */
export type StartupRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  industry: string;
  country: string;
  stage: string;
  incorporation_date: string | null;
  company_size: number | null;
  funding_stage: string | null;
  accumulated_revenue_myr?: number | null;
  malaysian_ownership_percent?: number | null;
  malaysian_employee_percent?: number | null;
  largest_external_entity_shareholding_percent?: number | null;
  owns_required_ip_rights?: string;
  application_participant_count?: number | null;
  has_ai_product?: string;
  has_full_time_cofounders?: string;
  has_dedicated_ai_engineers?: string;
  individual_applicant_status?: string;
  created_at: string;
  updated_at: string;
};

export type OpportunityRow = {
  id: string;
  title: string;
  description: string;
  kind: string;
  countries: string[];
  deadline: string | null;
  application_url: string;
  source_text: string;
  evidence: unknown;
  is_mock: boolean;
};

export const LEGACY_STARTUP_COLUMNS = "id, owner_id, name, description, industry, country, stage, incorporation_date, company_size, funding_stage, created_at, updated_at";
export const STARTUP_COLUMNS = "id, owner_id, name, description, industry, country, stage, incorporation_date, company_size, funding_stage, accumulated_revenue_myr, malaysian_ownership_percent, malaysian_employee_percent, largest_external_entity_shareholding_percent, owns_required_ip_rights, application_participant_count, has_ai_product, has_full_time_cofounders, has_dedicated_ai_engineers, individual_applicant_status, created_at, updated_at";
export const OPPORTUNITY_COLUMNS = "id, title, description, kind, countries, deadline, application_url, source_text, evidence, is_mock";

/** Postgres returns offsets such as +00:00; the contracts require UTC "Z" timestamps. */
const toUtc = (value: string) => new Date(value).toISOString();

export function toStartupProfile(row: StartupRow): StartupProfile {
  return startupProfileSchema.parse({
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    industry: row.industry,
    country: row.country,
    stage: row.stage,
    incorporationDate: row.incorporation_date,
    companySize: row.company_size,
    fundingStage: row.funding_stage,
    accumulatedRevenueMyr: row.accumulated_revenue_myr ?? null,
    malaysianOwnershipPercent: row.malaysian_ownership_percent ?? null,
    malaysianEmployeePercent: row.malaysian_employee_percent ?? null,
    largestExternalEntityShareholdingPercent: row.largest_external_entity_shareholding_percent ?? null,
    ownsRequiredIpRights: row.owns_required_ip_rights ?? "unknown",
    applicationParticipantCount: row.application_participant_count ?? null,
    hasAiProduct: row.has_ai_product ?? "unknown",
    hasFullTimeCofounders: row.has_full_time_cofounders ?? "unknown",
    hasDedicatedAiEngineers: row.has_dedicated_ai_engineers ?? "unknown",
    individualApplicantStatus: row.individual_applicant_status ?? "unknown",
    createdAt: toUtc(row.created_at),
    updatedAt: toUtc(row.updated_at),
  });
}

/** PostgreSQL/PostgREST codes used when deployed code reaches a database whose profile migration is pending. */
export function isMissingStartupEligibilityColumnError(error: unknown): boolean {
  if (error === null || typeof error !== "object" || !("code" in error)) return false;
  const code = String((error as { code?: unknown }).code ?? "");
  return code === "42703" || code === "PGRST204";
}

/** Owner is deliberately excluded: callers set owner_id from the verified session only. */
export function toLegacyStartupWrite(input: StartupProfileInput) {
  return {
    name: input.name,
    description: input.description,
    industry: input.industry,
    country: input.country,
    stage: input.stage,
    incorporation_date: input.incorporationDate,
    company_size: input.companySize,
    funding_stage: input.fundingStage,
  };
}

export function toStartupWrite(input: StartupProfileInput) {
  return {
    ...toLegacyStartupWrite(input),
    accumulated_revenue_myr: input.accumulatedRevenueMyr,
    malaysian_ownership_percent: input.malaysianOwnershipPercent,
    malaysian_employee_percent: input.malaysianEmployeePercent,
    largest_external_entity_shareholding_percent: input.largestExternalEntityShareholdingPercent,
    owns_required_ip_rights: input.ownsRequiredIpRights,
    application_participant_count: input.applicationParticipantCount,
    has_ai_product: input.hasAiProduct,
    has_full_time_cofounders: input.hasFullTimeCofounders,
    has_dedicated_ai_engineers: input.hasDedicatedAiEngineers,
    individual_applicant_status: input.individualApplicantStatus,
  };
}

export function hasExtendedStartupEligibilityData(input: StartupProfileInput): boolean {
  return input.accumulatedRevenueMyr !== null
    || input.malaysianOwnershipPercent !== null
    || input.malaysianEmployeePercent !== null
    || input.largestExternalEntityShareholdingPercent !== null
    || input.ownsRequiredIpRights !== "unknown"
    || input.applicationParticipantCount !== null
    || input.hasAiProduct !== "unknown"
    || input.hasFullTimeCofounders !== "unknown"
    || input.hasDedicatedAiEngineers !== "unknown"
    || input.individualApplicantStatus !== "unknown";
}

export function toOpportunity(row: OpportunityRow): Opportunity {
  return opportunitySchema.parse({
    id: row.id,
    title: row.title,
    description: row.description,
    kind: row.kind,
    countries: row.countries,
    deadline: row.deadline ? toUtc(row.deadline) : null,
    applicationUrl: row.application_url,
    sourceText: row.source_text,
    evidence: row.evidence,
    isMock: row.is_mock,
  });
}
