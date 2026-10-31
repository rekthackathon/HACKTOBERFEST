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

export const STARTUP_COLUMNS = "id, owner_id, name, description, industry, country, stage, incorporation_date, company_size, funding_stage, created_at, updated_at";
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
    createdAt: toUtc(row.created_at),
    updatedAt: toUtc(row.updated_at),
  });
}

/** Owner is deliberately excluded: callers set owner_id from the verified session only. */
export function toStartupWrite(input: StartupProfileInput) {
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
