import "server-only";

import { type ApiErrorCode } from "@/lib/http";
import {
  compiledRequirementsSchema,
  type CompiledRequirements,
  type EligibilityRequirement,
  type Opportunity,
  type PostFundingMilestone,
  type SourceEvidence,
} from "@/lib/contracts";
import { compilationCacheKey, MemoryCache } from "@/lib/cache";
import { getAiConfig, type AiConfig } from "@/lib/ai/config";
import {
  AiProviderError,
  buildCompilationPrompt,
  COMPILATION_PROMPT_VERSION,
  parseModelJson,
  requestGemmaText,
} from "@/lib/ai/gemma";
import { requestOllamaCloudText, requestOllamaText } from "@/lib/ai/ollama";

/**
 * Orchestrates provider-independent eligibility compilation:
 *
 *   trusted server-side opportunity → size budgets → cache lookup → provider
 *   call → untrusted-output parsing → Zod validation → provenance echo check →
 *   evidence verification (partial downgrades) → cache write.
 *
 * The cache stores only successfully validated compilations, keyed by the full
 * opportunity payload (including its ID), the exact model name, and the prompt
 * version, so results can never be mixed between opportunities, models, or
 * prompt revisions. See the per-process scope note in src/lib/cache/index.ts.
 *
 * All failures are returned as typed outcomes instead of thrown: message text
 * is generic and never contains provider payloads, prompts, or credentials.
 *
 * Evidence verification below establishes source provenance (the quote exists
 * in the server-held source and comes from a trusted snapshot) — it does not
 * guarantee semantic correctness of a rule: real quotes can be incomplete,
 * out of context, or misassigned by the model, which is why unsupported,
 * partial, and warning states always remain possible outcomes.
 */

export type CompilationFailure = {
  code: ApiErrorCode;
  message: string;
  retryAfterSeconds?: number;
};

export type CompilationOutcome =
  | { status: "compiled"; value: CompiledRequirements }
  | { status: "cache_hit"; value: CompiledRequirements }
  | { status: "failed"; failure: CompilationFailure };

export type CompilationServiceDeps = {
  /** Resolves the server-only AI configuration; throws when not configured. */
  config: () => AiConfig;
  /** Calls the AI provider with [config, prompt] and resolves the model text output. */
  request: (config: AiConfig, prompt: string) => Promise<string>;
  /** Server clock used for the recorded compilation timestamp. */
  nowIso: () => string;
  cache: MemoryCache<CompiledRequirements>;
};

export type CompilationServiceOptions = {
  /** Reject opportunities whose source text exceeds this many characters. */
  maxSourceChars: number;
  /** Reject prompts that exceed this many characters after assembly. */
  maxPromptChars: number;
};

export type CompilationService = {
  compile: (opportunity: Opportunity) => Promise<CompilationOutcome>;
};

/** Published storage limits: the contract allows up to 100k source chars; compilation stays tighter. */
export const COMPILE_MAX_SOURCE_CHARS = 50_000;
export const COMPILE_MAX_PROMPT_CHARS = 96_000;

function failure(code: ApiErrorCode, message: string, retryAfterSeconds?: number): CompilationOutcome {
  return { status: "failed", failure: { code, message, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) } };
}

function toFailure(error: unknown): CompilationOutcome {
  if (error instanceof AiProviderError) return failure(error.code, error.message, error.retryAfterSeconds);
  return failure("INTERNAL_ERROR", "An internal error occurred during AI compilation.");
}

/** Canonical fixed-field serialization of the opportunity so cache keys always include the opportunity ID. */
function serializeCompilationSource(opportunity: Opportunity): string {
  return JSON.stringify({
    id: opportunity.id,
    title: opportunity.title,
    description: opportunity.description,
    kind: opportunity.kind,
    countries: opportunity.countries,
    deadline: opportunity.deadline,
    applicationUrl: opportunity.applicationUrl,
    sourceText: opportunity.sourceText,
    evidence: opportunity.evidence,
    isMock: opportunity.isMock,
  });
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function quoteOccursInText(quote: string, text: string): boolean {
  return quote.trim().length > 0 && text.includes(quote);
}

type EvidenceVerdict = { verified: true; evidence: SourceEvidence } | { verified: false };

/**
 * Verifies that a model-supplied evidence record is grounded in the trusted
 * opportunity. It is verified only when it exactly matches a trusted record,
 * or when its source URL and retrieval timestamp match a trusted record and
 * its quote occurs verbatim in the trusted
 * source text. No evidence facts are ever invented by the verifier.
 *
 * Scope: this establishes source provenance — that the quoted condition exists
 * in the server-held source text and originates from a trusted snapshot URL
 * and retrieval date — but it does not guarantee semantic correctness. A quote
 * can be real yet incomplete, out of context, or wrongly paired with a rule by
 * the model; the `unsupported`, `partial`, and warning paths preserve those
 * doubts for deterministic evaluation and human review.
 */
function verifyEvidence(evidence: SourceEvidence, opportunity: Opportunity): EvidenceVerdict {
  const trusted = opportunity.evidence;
  const exact = trusted.find((record) =>
    record.sourceUrl === evidence.sourceUrl
    && record.quote === evidence.quote
    && record.locator === evidence.locator
    && record.retrievedAt === evidence.retrievedAt);
  if (exact) return { verified: true, evidence };
  const referencesSnapshot = trusted.some((record) => record.sourceUrl === evidence.sourceUrl && record.retrievedAt === evidence.retrievedAt);
  if (referencesSnapshot && quoteOccursInText(evidence.quote, opportunity.sourceText)) {
    return { verified: true, evidence };
  }
  return { verified: false };
}

const COUNTRY_TERMS: Record<string, string[]> = {
  BN: ["brunei"], KH: ["cambodia", "cambodian"], ID: ["indonesia", "indonesian"],
  LA: ["laos", "lao"], MY: ["malaysia", "malaysian"], MM: ["myanmar", "burmese"],
  PH: ["philippines", "philippine", "filipino"], SG: ["singapore", "singaporean"],
  TH: ["thailand", "thai"], TL: ["timor-leste", "timor leste"], VN: ["vietnam", "vietnamese"],
};
const STOP_WORDS = new Set(["the", "and", "for", "with", "must", "shall", "have", "from", "that", "this", "company", "startup", "applicant", "application", "requirement"]);

function quoteHasNumber(quote: string, value: number): boolean {
  const normalized = quote.toLowerCase().replace(/,/g, "");
  if (normalized.includes(String(value))) return true;
  if (Number.isInteger(value / 1_000_000) && normalized.includes(`${value / 1_000_000} million`)) return true;
  if (Number.isInteger(value / 1_000) && normalized.includes(`${value / 1_000} thousand`)) return true;
  return false;
}

function hasMeaningfulOverlap(text: string, quote: string): boolean {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length >= 3 && !STOP_WORDS.has(token)) ?? [];
  const quoteTokens = new Set(quote.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const unique = [...new Set(tokens)];
  return unique.length > 0 && unique.filter((token) => quoteTokens.has(token)).length >= Math.min(2, unique.length);
}

/** Conservative rule-specific semantic check; uncertain pairings are discarded for review. */
function evidenceSupportsRequirement(requirement: EligibilityRequirement, quote: string): boolean {
  const text = normalizeWhitespace(quote).toLowerCase();
  switch (requirement.kind) {
    case "country": return /(based|incorporat|register|headquarter|establish|located|company in|startup in)/.test(text)
      && (requirement.allowed.every((country) => COUNTRY_TERMS[country].some((term) => text.includes(term)))
        || (requirement.allowed.length === 11 && text.includes("southeast asia")));
    case "stage": return requirement.allowed.every((stage) => text.includes(stage)) && /(stage|prototype|mvp|product|startup)/.test(text);
    case "funding_stage": {
      const seedToSeriesB = requirement.allowed.length === 3
        && requirement.allowed.includes("seed")
        && requirement.allowed.includes("series_a")
        && requirement.allowed.includes("series_b")
        && /seed\s*(?:to|through|-)\s*series\s*b/.test(text);
      return (seedToSeriesB || requirement.allowed.every((stage) => text.includes(stage.replaceAll("_", " "))))
        && /(funding|funded|investment|seed|series|bootstrapped)/.test(text);
    }
    case "company_size_max": return /(employee|staff|team|workforce)/.test(text) && quoteHasNumber(text, requirement.maximum);
    case "incorporated_on_or_after": return /(incorporat|register|establish)/.test(text) && text.includes(requirement.date.slice(0, 4));
    case "company_age_max": return /(year|age|old|incorporat)/.test(text) && quoteHasNumber(text, requirement.maximumYears);
    case "accumulated_revenue_max": return /(revenue|sales|turnover)/.test(text) && quoteHasNumber(text, requirement.maximumMyr);
    case "malaysian_ownership_min": return /malaysian/.test(text) && /(own|sharehold|equity)/.test(text) && quoteHasNumber(text, requirement.minimumPercent);
    case "malaysian_employees_min": return /malaysian/.test(text) && /(employee|staff|workforce)/.test(text) && quoteHasNumber(text, requirement.minimumPercent);
    case "malaysian_ownership_or_employees": return /malaysian/.test(text)
      && /(own|sharehold|equity)/.test(text)
      && /(employee|staff|workforce)/.test(text)
      && /(\bor\b|if .*own|less than .*own|otherwise)/.test(text)
      && quoteHasNumber(text, requirement.ownershipMinimumPercent)
      && quoteHasNumber(text, requirement.employeeMinimumPercent);
    case "external_entity_shareholding_max": return /(external|other company|entity|corporate)/.test(text)
      && /(own|sharehold|equity|stake)/.test(text)
      && quoteHasNumber(text, requirement.maximumPercent);
    case "ip_rights_required": return /(intellectual property|\bip\b)/.test(text) && /(own|right|license)/.test(text);
    case "application_team_size_min": return /(individual|participant|team member|person|people)/.test(text) && quoteHasNumber(text, requirement.minimum);
    case "ai_product_required": return /(\bai\b|artificial intelligence)/.test(text) && /(product|solution|platform|technology)/.test(text);
    case "full_time_cofounders_required": return /full[- ]time/.test(text) && /co[- ]?founder/.test(text);
    case "dedicated_ai_engineers_required": return /dedicated/.test(text)
      && /(\bai\b|artificial intelligence)/.test(text)
      && /engineer/.test(text);
    case "individual_applicant_residency": return /individual/.test(text)
      && /(malaysian|malaysia)/.test(text)
      && /(resid|citizen|national|open to)/.test(text);
    case "unsupported": return hasMeaningfulOverlap(`${requirement.description} ${requirement.reason}`, text);
  }
}

function isApplicationTimelineLanguage(quote: string): boolean {
  const text = normalizeWhitespace(quote).toLowerCase();
  return /(applications? (?:open|close)|application deadline|submission deadline|deadline (?:is|on)|interview (?:date|schedule)|(?:will be |are )?notif(?:y|ied|ication)|results? announced|shortlisted .*(?:by|on))/i.test(text);
}

function isPostFundingLanguage(quote: string): boolean {
  const text = normalizeWhitespace(quote).toLowerCase();
  return /(by the end|during (the )?(funding|programme|program)|after (funding|award)|within .*(month|year)|upon completion)/.test(text);
}

function evidenceSupportsMilestone(milestone: PostFundingMilestone, quote: string): boolean {
  const text = normalizeWhitespace(quote).toLowerCase();
  return isPostFundingLanguage(text)
    && hasMeaningfulOverlap(milestone.description, text);
}

function discardedEvidenceWarning(description: string, verified: boolean): string {
  const condition = description.trim().slice(0, 180);
  const quotedCondition = condition ? ` “${condition}”` : "";
  return verified
    ? `An extracted condition${quotedCondition} was excluded because its quote did not support that rule. Check the source and extraction.`
    : `An extracted condition${quotedCondition} was excluded because its evidence was missing or did not match the trusted source.`;
}

/**
 * Discards ungrounded or semantically mismatched conditions. It never invents
 * replacement evidence and never displays an invalid condition as a programme
 * rule. Any discard marks the compilation partial and leaves an audit warning.
 */
function groundCompilation(parsed: CompiledRequirements, opportunity: Opportunity, compiledAt: string): CompiledRequirements {
  const discardWarnings: string[] = [];
  const reclassifiedMilestones: PostFundingMilestone[] = [];
  const requirements = parsed.requirements.filter((requirement) => {
    const verdict = verifyEvidence(requirement.evidence, opportunity);
    if (verdict.verified && isApplicationTimelineLanguage(verdict.evidence.quote)) return false;
    if (verdict.verified && isPostFundingLanguage(verdict.evidence.quote)) {
      reclassifiedMilestones.push({
        id: requirement.id,
        kind: "post_funding_milestone",
        description: requirement.description,
        evidence: requirement.evidence,
      });
      return false;
    }
    const keep = verdict.verified && evidenceSupportsRequirement(requirement, verdict.evidence.quote);
    if (!keep) discardWarnings.push(discardedEvidenceWarning(requirement.description, verdict.verified));
    return keep;
  });
  const milestones = [...parsed.milestones.filter((milestone) => {
    const verdict = verifyEvidence(milestone.evidence, opportunity);
    if (verdict.verified && isApplicationTimelineLanguage(verdict.evidence.quote)) return false;
    const keep = verdict.verified && evidenceSupportsMilestone(milestone, verdict.evidence.quote);
    if (!keep) discardWarnings.push(discardedEvidenceWarning(milestone.description, verdict.verified));
    return keep;
  }), ...reclassifiedMilestones];
  const warnings = [...parsed.warnings, ...discardWarnings].slice(0, 100);
  const completeness = discardWarnings.length > 0 ? "partial" : parsed.completeness;
  return { ...parsed, compiledAt, completeness, requirements, milestones, warnings };
}

/**
 * Model generated IDs and timestamps are bookkeeping, not eligibility facts.
 * Replace them with server values before strict contract validation so a
 * repeated or malformed ID cannot prevent an otherwise valid extraction.
 * Requirement contents and evidence are left untouched and remain strictly
 * validated below.
 */
function normalizeModelEnvelope(value: unknown, opportunity: Opportunity, model: string, compiledAt: string): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const output = value as Record<string, unknown>;
  const uniqueIds = (items: unknown, prefix: string): unknown => {
    if (!Array.isArray(items)) return items;
    return items.map((item, index) => {
      if (item === null || typeof item !== "object" || Array.isArray(item)) return item;
      return { ...(item as Record<string, unknown>), id: `${prefix}-${index + 1}` };
    });
  };
  return {
    ...output,
    ...("opportunityId" in output ? {} : { opportunityId: opportunity.id }),
    ...( "model" in output ? {} : { model }),
    compiledAt,
    requirements: uniqueIds(output.requirements, "requirement"),
    milestones: uniqueIds(output.milestones, "milestone"),
  };
}

/** Selects exactly one server-only client from the validated provider configuration. */
export function requestAiText(config: AiConfig, prompt: string): Promise<string> {
  if (config.provider === "ollama") return requestOllamaText({ config, prompt });
  if (config.provider === "ollama-cloud") return requestOllamaCloudText({ config, prompt });
  return requestGemmaText({ config, prompt });
}

function createCompilationDeps(overrides: Partial<CompilationServiceDeps> = {}): CompilationServiceDeps {
  return {
    config: overrides.config ?? getAiConfig,
    request: overrides.request ?? requestAiText,
    nowIso: overrides.nowIso ?? (() => new Date().toISOString()),
    cache: overrides.cache ?? new MemoryCache<CompiledRequirements>({ ttlMs: 6 * 60 * 60 * 1000, maxEntries: 50 }),
  };
}

/**
 * Creates a compilation service. Dependency overrides exist for deterministic
 * tests; production callers use getCompilationService().
 */
export function createCompilationService(overrides: Partial<CompilationServiceDeps> = {}, options: CompilationServiceOptions = { maxSourceChars: COMPILE_MAX_SOURCE_CHARS, maxPromptChars: COMPILE_MAX_PROMPT_CHARS }): CompilationService {
  const deps = createCompilationDeps(overrides);

  async function compile(opportunity: Opportunity): Promise<CompilationOutcome> {
    let config: AiConfig;
    try {
      config = deps.config();
    } catch {
      return failure("NOT_CONFIGURED", "AI inference is not configured on the server.");
    }

    const cacheKey = compilationCacheKey({
      sourceContent: serializeCompilationSource(opportunity),
      // The shared cache helper's model dimension carries provider identity as
      // well, preventing equal model aliases on different providers from sharing entries.
      model: `${config.provider}:${config.model}`,
      promptVersion: COMPILATION_PROMPT_VERSION,
    });
    const cached = deps.cache.get(cacheKey);
    if (cached && cached.opportunityId === opportunity.id) {
      return { status: "cache_hit", value: cached };
    }

    let compiled: CompiledRequirements;
    try {
      if (opportunity.sourceText.length > options.maxSourceChars) {
        throw new AiProviderError("VALIDATION_ERROR", "The programme source text exceeds the compilation size limit.");
      }
      const prompt = buildCompilationPrompt(opportunity, config.model);
      if (prompt.length > options.maxPromptChars) {
        throw new AiProviderError("VALIDATION_ERROR", "The assembled compilation request exceeds the prompt size limit.");
      }
      const modelText = await deps.request(config, prompt);
      const rawOutput = normalizeModelEnvelope(parseModelJson(modelText), opportunity, config.model, deps.nowIso());
      const parsed = compiledRequirementsSchema.safeParse(rawOutput);
      if (!parsed.success) {
        throw new AiProviderError("AI_UNAVAILABLE", "Model output failed schema validation.");
      }
      if (parsed.data.opportunityId !== opportunity.id || parsed.data.model !== config.model) {
        throw new AiProviderError("AI_UNAVAILABLE", "Model output did not reference the requested opportunity or model.");
      }
      compiled = groundCompilation(parsed.data, opportunity, deps.nowIso());
      const validated = compiledRequirementsSchema.safeParse(compiled);
      if (!validated.success) {
        throw new AiProviderError("AI_UNAVAILABLE", "Model output failed schema validation.");
      }
      compiled = validated.data;
    } catch (error) {
      // Compilation failures are deliberately never cached.
      return toFailure(error);
    }

    // Only fully validated compilations are stored.
    deps.cache.set(cacheKey, compiled);
    return { status: "compiled", value: compiled };
  }

  return { compile };
}

let serviceInstance: ReturnType<typeof createCompilationService> | undefined;
/** Production singleton used by the route handler. */
export function getCompilationService() {
  serviceInstance ??= createCompilationService();
  return serviceInstance;
}

/** Per-user fixed-window rate limiter with a bounded, per-process bucket map. */
export type CompilationRateLimiter = {
  /** Counts the request unless the window is exhausted; reports a Retry-After hint otherwise. */
  check(key: string, now?: number): { allowed: true } | { allowed: false; retryAfterSeconds: number };
};

type RateWindow = { windowStart: number; count: number };

/** Creates a per-user fixed-window limiter; exposed for deterministic tests and route composition. */
export function createCompilationRateLimiter(options: { limit: number; windowMs: number }, cache: MemoryCache<RateWindow> = new MemoryCache<RateWindow>({ ttlMs: options.windowMs * 2, maxEntries: 5_000 })): CompilationRateLimiter {
  return {
    check(key: string, now: number = Date.now()) {
      const bucket = cache.get(key);
      if (bucket === undefined || now - bucket.windowStart >= options.windowMs) {
        cache.set(key, { windowStart: now, count: 1 });
        return { allowed: true };
      }
      if (bucket.count >= options.limit) {
        const remainingMs = options.windowMs - (now - bucket.windowStart);
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
      }
      cache.set(key, { windowStart: bucket.windowStart, count: bucket.count + 1 });
      return { allowed: true };
    },
  };
}

/** Published defaults: five compilations per user per minute. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

let limiterInstance: CompilationRateLimiter | undefined;
/** Production singleton used by the route handler. */
export function getCompilationRateLimiter(): CompilationRateLimiter {
  limiterInstance ??= createCompilationRateLimiter({ limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS });
  return limiterInstance;
}
