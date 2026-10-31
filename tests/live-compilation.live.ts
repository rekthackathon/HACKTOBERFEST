/**
 * TEMPORARY manually invoked live integration test — not committed, excluded
 * from npm run check (the root include only matches the regular .test.ts files), and
 * skipped unless RUN_LIVE=1 is set. Invoke with:
 *
 *   RUN_LIVE=1 npx vitest run --config tests/vitest.live.config.ts
 *
 * What it does:
 * - Uses the already-validated mock opportunity from src/lib/mocks.
 * - Calls the real createCompilationService() with its default dependencies,
 *   i.e. the actual Gemma provider client (requestGemmaText). Nothing is mocked.
 * - Loads AI_BASE_URL / AI_API_KEY / AI_MODEL from .env.local in memory and
 *   never prints any secret, the prompt, or the full source text.
 * - Prints the HTTP-independent compilation outcome (status, requirement kinds,
 *   completeness, warnings). The API route and its authentication are untouched.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AiProviderError } from "@/lib/ai/gemma";

const LIVE_GUARD = process.env.RUN_LIVE === "1";

type LoadedAiEnv = { baseUrl: string; apiKey: string; model: string };

/** Parses .env.local in memory; values are only placed into process.env and are never printed. */
function loadAiEnvFromLocalFile(): LoadedAiEnv | { error: string } {
  const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
  let text: string;
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return { error: ".env.local was not found. Copy .env.example to .env.local and set AI_BASE_URL, AI_API_KEY, and AI_MODEL." };
  }
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (key.length > 0) values.set(key, value);
  }
  const missing = ["AI_BASE_URL", "AI_API_KEY", "AI_MODEL"].filter((key) => !values.get(key));
  if (missing.length > 0) {
    return { error: `AI configuration keys missing in .env.local: ${missing.join(", ")}` };
  }
  return { baseUrl: values.get("AI_BASE_URL") as string, apiKey: values.get("AI_API_KEY") as string, model: values.get("AI_MODEL") as string };
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
}

describe.skipIf(!LIVE_GUARD)("live Gemma compilation (manual)", () => {
  it("compiles the validated mock opportunity through the real provider", async () => {
    const loaded = loadAiEnvFromLocalFile();
    if ("error" in loaded) {
      console.error(`Live test aborted: ${loaded.error}`);
      throw new Error(`Live test aborted: ${loaded.error}`);
    }
    // Configuration travels through process.env exactly as in production so
    // the real getAiConfig() validation runs; values are never logged.
    process.env.AI_PROVIDER = "gemma";
    process.env.AI_BASE_URL = loaded.baseUrl;
    process.env.AI_API_KEY = loaded.apiKey;
    process.env.AI_MODEL = loaded.model;

    const { createCompilationService } = await import("@/lib/ai/compilation");
    const { mockOpportunities } = await import("@/lib/mocks");

    const opportunity = mockOpportunities[0];
    const service = createCompilationService(); // default deps = real provider client, no mocks
    const outcome = await service.compile(opportunity);

    expect(["compiled", "cache_hit", "failed"]).toContain(outcome.status);

    console.log("--- live Gemma compilation outcome (HTTP-independent) ---");
    console.log(`opportunityId: ${opportunity.id} (validated mock; source text retained server-side, ${opportunity.sourceText.length} chars, not printed)`);
    console.log(`provider model: ${loaded.model}`);

    if (outcome.status === "failed") {
      const { code, message, retryAfterSeconds } = outcome.failure;
      console.log(`status: failed`);
      console.log(`error code: ${code}`);
      console.log(`message: ${message}`);
      if (retryAfterSeconds !== undefined) console.log(`retryAfterSeconds: ${retryAfterSeconds}`);
      console.log("(rate-limited 429 responses surface as RATE_LIMITED; malformed model output as AI_UNAVAILABLE)");
    } else {
      console.log(`status: ${outcome.status === "cache_hit" ? "cache_hit" : "compiled (fresh; unused send-this-once run uses a never-cached fresh process)"}`);
      console.log(`model recorded: ${outcome.value.model}`);
      console.log(`compiledAt (server provenance): ${outcome.value.compiledAt}`);
      console.log(`completeness: ${outcome.value.completeness}`);
      console.log(`requirements (${outcome.value.requirements.length}):`);
      for (const requirement of outcome.value.requirements) {
        const kind = requirement.kind;
        const suffix = "allowed" in requirement ? ` allowed=${JSON.stringify(requirement.allowed)}`
          : "maximum" in requirement ? ` maximum=${requirement.maximum}`
          : "date" in requirement ? ` date=${requirement.date}`
          : "";
        console.log(`  - [${kind}] ${requirement.id}: ${truncate(requirement.description, 80)}${suffix}`);
      }
      console.log(`warnings (${outcome.value.warnings.length}): ${outcome.value.warnings.length === 0 ? "none" : ""}`);
      for (const warning of outcome.value.warnings) console.log(`  - ${truncate(warning, 160)}`);
    }
    console.log("--- end live outcome (no secrets, no source text printed) ---");
  });
});

describe.skipIf(!LIVE_GUARD)("live Gemma diagnostic (exact production body reproduction)", () => {
  const mode = process.env.LIVE_DIAG_MODE ?? "full-node";

  /** Builds the exact production request body shapes for the isolation probes. */
  async function buildBody(): Promise<{ body: string; label: string }> {
    const [{ buildCompilationPrompt }, { mockOpportunities }] = await Promise.all([
      import("@/lib/ai/gemma"),
      import("@/lib/mocks"),
    ]);
    const prompt = buildCompilationPrompt(mockOpportunities[0], process.env.AI_MODEL ?? "");
    if (mode === "padded-node") {
      // Size-matched control with trivial content.
      const tokens = Array.from({ length: 60 }, (_, i) => `pad token ${i}`).join(", ");
      const padded = `Filler sentence for transport diagnostics. (${tokens}). Reply with "ok".`;
      const paddedText = padded.repeat(Math.ceil(3152 / padded.length));
      const body = JSON.stringify({
        contents: [{ role: "user", parts: [{ text: paddedText }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8 },
      });
      return { body, label: `padded-node (${body.length} bytes)` };
    }
    if (mode === "source-only-node") {
      // Source-text-only control: same opportunity wording, none of the template.
      const { mockOpportunities: mocks } = await import("@/lib/mocks");
      const body = JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${mocks[0].sourceText} Reply with "ok".` }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8 },
      });
      return { body, label: `source-only-node (${body.length} bytes)` };
    }
    const body = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 8192 },
    });
    return { body, label: `${mode} (prompt=${prompt.length} chars, body=${body.length} bytes)` };
  }

  it("reproduces the request body to isolate the hang", { timeout: 210_000 }, async () => {
    const loaded = loadAiEnvFromLocalFile();
    if ("error" in loaded) {
      throw new Error(`Live diagnostic aborted: ${loaded.error}`);
    }
    process.env.AI_PROVIDER = "gemma";
    process.env.AI_BASE_URL = loaded.baseUrl;
    process.env.AI_API_KEY = loaded.apiKey;
    process.env.AI_MODEL = loaded.model;

    const [{ buildGemmaUrl }] = await Promise.all([import("@/lib/ai/gemma")]);
    const url = buildGemmaUrl(loaded.baseUrl, loaded.model);
    const { body, label } = await buildBody();
    console.log(`reproduction [${mode}]: ${label}; secret leak check=${String(body).includes(loaded.apiKey) ? "YES-LEAK" : "none"}`);

    if (mode === "full-curl") {
      // curl parity via files so the key never appears in the process argument list.
      const { execFileSync } = await import("node:child_process");
      writeFileSync("/tmp/opencode/gemma-body.json", body);
      writeFileSync("/tmp/opencode/gemma-curl.cfg", `max-time = 60\nsilent\nshow-error\noutput = "/dev/null"\nrequest = "POST"\nurl = "${url}"\nheader = "content-type: application/json"\nheader = "x-goog-api-key: ${loaded.apiKey}"\ndata-binary = "@/tmp/opencode/gemma-body.json"\nwrite-out = "%{http_code} %{time_total}s"\n`);
      try {
        execFileSync("curl", ["-K", "/tmp/opencode/gemma-curl.cfg"], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
        console.log(`reproduction [full-curl]: completed (body content not printed)`);
      } catch (error) {
        const err = error as { status?: number; stdout?: Buffer; stderr?: Buffer };
        const stderrText = err.stderr?.toString().replace(/x-goog-api-key[^ ]*/gi, "REDACTED") ?? "";
        console.log(`reproduction [full-curl]: exit=${err.status ?? "?"} stdout=${truncate(err.stdout?.toString() ?? "", 80)} stderr=${truncate(stderrText, 160)}`);
      } finally {
        try { unlinkSync("/tmp/opencode/gemma-body.json"); } catch { /* already gone */ }
        try { unlinkSync("/tmp/opencode/gemma-curl.cfg"); } catch { /* already gone */ }
      }
      return;
    }

    const started = performance.now();
    const controller = new AbortController();
    const capMs = mode === "full-long" ? 180_000 : 60_000;
    const timer = setTimeout(() => controller.abort(), capMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        redirect: "error",
        headers: { "content-type": "application/json", "x-goog-api-key": loaded.apiKey },
        body,
      });
      const elapsed = performance.now() - started;
      await response.text();
      console.log(`reproduction [${mode}]: HTTP ${response.status} in ${elapsed.toFixed(0)}ms (model text not printed)`);
    } catch (error) {
      const elapsed = performance.now() - started;
      const timedOut = controller.signal.aborted;
      console.log(`reproduction [${mode}]: FAILED in ${elapsed.toFixed(0)}ms timedOut=${timedOut} errorName=${error instanceof Error ? error.name : "unknown"}`);
      if (error instanceof Error && error.cause !== undefined) {
        console.log(`reproduction [${mode}]: underlying cause name=${(error.cause as Error)?.name ?? "?"} message=${truncate(String((error.cause as Error)?.message ?? ""), 120)}`);
      }
    } finally {
      clearTimeout(timer);
    }
  });
});

describe.skipIf(!LIVE_GUARD)("live Gemma diagnostic (single bounded request)", () => {
  it("measures one real requestGemmaText call with timeoutMs 90000 and validates any output", async () => {
    const loaded = loadAiEnvFromLocalFile();
    if ("error" in loaded) {
      throw new Error(`Live diagnostic aborted: ${loaded.error}`);
    }
    process.env.AI_PROVIDER = "gemma";
    process.env.AI_BASE_URL = loaded.baseUrl;
    process.env.AI_API_KEY = loaded.apiKey;
    process.env.AI_MODEL = loaded.model;

    const [{ buildCompilationPrompt, requestGemmaText }, { mockOpportunities }] = await Promise.all([
      import("@/lib/ai/gemma"),
      import("@/lib/mocks"),
    ]);

    const config = { provider: "gemma" as const, baseUrl: loaded.baseUrl, apiKey: loaded.apiKey, model: loaded.model };
    const opportunity = mockOpportunities[0];
    const prompt = buildCompilationPrompt(opportunity, config.model);
    console.log(`diagnostic: prompt assembled (${prompt.length} chars, content not printed)`);
    console.log(`diagnostic: proxy env detected=${Object.keys(process.env).some((key) => /proxy/i.test(key) && key.toUpperCase() !== "NO_PROXY")}`);

    // Exactly one live provider request; the bound is configurable so the
    // discovered ~134s Gemma inference latency can be used for the final run.
    const timeoutMs = Number(process.env.LIVE_DIAG_TIMEOUT_MS ?? 90_000);
    console.log(`diagnostic: requestGemmaText bound=${timeoutMs}ms (LIVE_DIAG_TIMEOUT_MS)`);
    const started = performance.now();
    let modelText: string | undefined;
    try {
      modelText = await requestGemmaText({ config, prompt, timeoutMs });
    } catch (error) {
      const elapsed = performance.now() - started;
      if (error instanceof AiProviderError) {
        console.log(`diagnostic: PROVIDER FAILURE after ${elapsed.toFixed(0)}ms`);
        console.log(`diagnostic: error code=${error.code} message="${error.message}"${error.retryAfterSeconds === undefined ? "" : ` retryAfterSeconds=${error.retryAfterSeconds}`}`);
        const timedOut = error.message.includes("timed out");
        console.log(`diagnostic: classification=${timedOut ? "TIMEOUT (bound reached; network-level hang suspected)" : "HTTP/provider error"}`);
      } else {
        console.log(`diagnostic: UNEXPECTED non-provider failure after ${elapsed.toFixed(0)}ms`);
      }
      // Diagnostic mode: record the failure without failing the test run.
      return;
    }
    const elapsed = performance.now() - started;
    console.log(`diagnostic: SUCCESS after ${elapsed.toFixed(0)}ms; model text length=${modelText.length} (content not printed)`);

    // Validate the captured text through the real compilation service without a
    // second provider request (the request dependency returns the captured text).
    const { createCompilationService } = await import("@/lib/ai/compilation");
    const validationService = createCompilationService({
      config: () => ({ provider: "gemma", baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model }),
      request: async () => modelText as string,
    });
    const validationStarted = performance.now();
    const outcome = await validationService.compile(opportunity);
    const validationElapsed = performance.now() - validationStarted;
    console.log(`diagnostic: service validation done in ${validationElapsed.toFixed(0)}ms`);

    expect(["compiled", "cache_hit", "failed"]).toContain(outcome.status);
    if (outcome.status === "failed") {
      console.log(`diagnostic: validation FAILED code=${outcome.failure.code} message="${outcome.failure.message}"`);
      return;
    }
    console.log(`diagnostic: Zod schema validation${outcome.status === "cache_hit" ? " (cache revalidation)" : ""}: PASSED`);
    console.log(`diagnostic: provenance echo + evidence verification: PASSED`);
    console.log(`diagnostic: status=${outcome.status} completeness=${outcome.value.completeness} compiledAt=${outcome.value.compiledAt}`);
    for (const requirement of outcome.value.requirements) {
      const suffix = "allowed" in requirement ? ` allowed=${JSON.stringify(requirement.allowed)}`
        : "maximum" in requirement ? ` maximum=${requirement.maximum}`
        : "date" in requirement ? ` date=${requirement.date}`
        : "";
      console.log(`diagnostic: requirement [${requirement.kind}] ${requirement.id}: ${truncate(requirement.description, 80)}${suffix}`);
    }
    console.log(`diagnostic: warnings (${outcome.value.warnings.length}):${outcome.value.warnings.length === 0 ? " none" : ""}`);
    for (const warning of outcome.value.warnings) console.log(`diagnostic:   - ${truncate(warning, 160)}`);
  });
});
