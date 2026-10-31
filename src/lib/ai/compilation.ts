import "server-only";

import { type ApiErrorCode } from "@/lib/http";
import { compiledRequirementsSchema, type CompiledRequirements, type Opportunity, type SourceEvidence } from "@/lib/contracts";
import { compilationCacheKey, MemoryCache } from "@/lib/cache";
import { getAiConfig, type AiConfig } from "@/lib/ai/config";
import {
  AiProviderError,
  buildCompilationPrompt,
  COMPILATION_PROMPT_VERSION,
  parseModelJson,
  requestGemmaText,
} from "@/lib/ai/gemma";
import { requestOllamaText } from "@/lib/ai/ollama";

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
  const normalizedQuote = normalizeWhitespace(quote);
  return normalizedQuote.length > 0 && normalizeWhitespace(text).includes(normalizedQuote);
}

type EvidenceVerdict = { verified: true; evidence: SourceEvidence } | { verified: false; record: SourceEvidence };

/**
 * Verifies that a model-supplied evidence record is grounded in the trusted
 * opportunity. It is verified only when it exactly matches a trusted record,
 * or when its source URL and retrieval timestamp match a trusted record and
 * its quote occurs verbatim (ignoring whitespace differences) in the trusted
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
  const referenced = trusted.find((record) => record.sourceUrl === evidence.sourceUrl);
  if (referenced && evidence.retrievedAt === referenced.retrievedAt && quoteOccursInText(evidence.quote, opportunity.sourceText)) {
    return { verified: true, evidence };
  }
  return { verified: false, record: referenced ?? trusted[0] };
}

const UNVERIFIED_EVIDENCE_REASON = "A model-reported condition could not be verified against the trusted programme source.";
const UNVERIFIED_EVIDENCE_WARNING = "One or more requirements were marked unsupported because the model's evidence could not be verified against the trusted source.";

/**
 * Rewrites unverified evidence: supported rules become `unsupported` with a
 * trusted evidence record, and unsupported rules keep their kind and reason
 * but attach a trusted record. Any rewrite marks the compilation partial and
 * records a warning so uncertain extraction never reads as verified.
 */
function groundCompilation(parsed: CompiledRequirements, opportunity: Opportunity, compiledAt: string): CompiledRequirements {
  const requirements = parsed.requirements.map((requirement) => {
    const verdict = verifyEvidence(requirement.evidence, opportunity);
    if (verdict.verified) return requirement;
    if (requirement.kind === "unsupported") {
      return { ...requirement, evidence: verdict.record };
    }
    return {
      id: requirement.id,
      kind: "unsupported" as const,
      description: requirement.description,
      reason: UNVERIFIED_EVIDENCE_REASON,
      evidence: verdict.record,
    };
  });
  const downgraded = requirements.some((requirement, index) => requirement !== parsed.requirements[index]);
  const warnings = [...parsed.warnings, ...(downgraded ? [UNVERIFIED_EVIDENCE_WARNING] : [])].slice(0, 100);
  const completeness = downgraded ? "partial" : parsed.completeness;
  return { ...parsed, compiledAt, completeness, requirements, warnings };
}

/** Selects exactly one server-only client from the validated provider configuration. */
export function requestAiText(config: AiConfig, prompt: string): Promise<string> {
  return config.provider === "ollama"
    ? requestOllamaText({ config, prompt })
    : requestGemmaText({ config, prompt });
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
      const rawOutput = parseModelJson(modelText);
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
