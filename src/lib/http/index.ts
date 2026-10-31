import "server-only";

import { z } from "zod";
import { apiErrorSchema, type ApiError } from "@/lib/contracts";

export type ApiErrorCode = ApiError["error"]["code"];

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

const statusByCode: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  NOT_CONFIGURED: 503,
  AI_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

/** HTTP status for each contract error code, matching docs/api-contracts.md. */
export function statusForCode(code: ApiErrorCode): number {
  return statusByCode[code];
}

/** Generates the correlation ID included in error envelopes. */
export function createRequestId(): string {
  return crypto.randomUUID();
}

/** Thrown by the helpers in this module for predictable failures. Route handlers convert it with toErrorResponse. Messages never contain provider payloads, credentials, or raw request data. */
export class ApiRequestError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = statusForCode(code);
  }
}

const noStoreHeaders = { "cache-control": "no-store" } as const;

/** Builds a JSON error Response that validates against apiErrorSchema at runtime. Never include secrets, stack traces, or upstream payloads in the message. */
export function apiErrorResponse(code: ApiErrorCode, message: string, options: { requestId?: string } = {}): Response {
  const requestId = options.requestId ?? createRequestId();
  const parsed = apiErrorSchema.safeParse({ error: { code, message: message.trim().length > 0 ? message : "Request failed.", requestId } });
  if (!parsed.success) {
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Request failed.", requestId } }, { status: statusForCode("INTERNAL_ERROR"), headers: noStoreHeaders });
  }
  return Response.json(parsed.data, { status: statusForCode(parsed.data.error.code), headers: noStoreHeaders });
}

/** Converts any thrown value into a safe error Response; unknown failures become a generic 500 that leaks nothing. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiRequestError) return apiErrorResponse(error.code, error.message);
  return apiErrorResponse("INTERNAL_ERROR", "An internal error occurred.");
}

/** Reads a JSON request body, enforces a size cap, and validates it with the provided schema. Error messages never include body contents. */
export async function readJsonBody<Schema extends z.ZodType>(request: Request, schema: Schema, options: { maxBytes?: number } = {}): Promise<z.output<Schema>> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (exceedsDeclaredLength(request.headers, maxBytes)) {
    throw new ApiRequestError("VALIDATION_ERROR", "Request body exceeds the allowed size.");
  }
  const bytes = await readBytesLimited(request.body, maxBytes, "VALIDATION_ERROR", "Request body exceeds the allowed size.", "Request body could not be read.");
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiRequestError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) throw new ApiRequestError("VALIDATION_ERROR", "Request body failed validation.");
  return parsed.data;
}

export type FetchJsonOptions<T> = {
  timeoutMs?: number;
  maxBytes?: number;
  schema?: z.ZodType<T>;
  headers?: Record<string, string>;
};

/**
 * Fetches a JSON resource over HTTPS with a bounded timeout and response size.
 * Intended for server-only upstream calls (for example the planned AI provider).
 * Network, status, parse, and schema failures become AI_UNAVAILABLE; the upstream
 * payload is never included in error messages, and nothing is logged.
 */
export async function fetchJsonWithTimeout<T>(url: string, options: FetchJsonOptions<T> = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_RESPONSE_BYTES, schema, headers } = options;
  const target = assertHttpsUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(target, { signal: controller.signal, headers, redirect: "error" });
    } catch {
      if (controller.signal.aborted) throw new ApiRequestError("AI_UNAVAILABLE", "Upstream request timed out.");
      throw new ApiRequestError("AI_UNAVAILABLE", "Upstream request failed.");
    }
    if (!response.ok) throw new ApiRequestError("AI_UNAVAILABLE", `Upstream request failed with status ${response.status}.`);
    if (exceedsDeclaredLength(response.headers, maxBytes)) {
      throw new ApiRequestError("AI_UNAVAILABLE", "Upstream response exceeds the allowed size.");
    }
    let bytes: Uint8Array;
    try {
      bytes = await readBytesLimited(response.body, maxBytes, "AI_UNAVAILABLE", "Upstream response exceeds the allowed size.", "Upstream response could not be read.");
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      if (controller.signal.aborted) throw new ApiRequestError("AI_UNAVAILABLE", "Upstream request timed out.");
      throw new ApiRequestError("AI_UNAVAILABLE", "Upstream response could not be read.");
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new ApiRequestError("AI_UNAVAILABLE", "Upstream response was not valid JSON.");
    }
    if (!schema) return parsedJson as T;
    const parsed = schema.safeParse(parsedJson);
    if (!parsed.success) throw new ApiRequestError("AI_UNAVAILABLE", "Upstream response failed schema validation.");
    return parsed.data;
  } finally {
    clearTimeout(timer);
  }
}

function assertHttpsUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ApiRequestError("VALIDATION_ERROR", "Source URL must be a valid URL.");
  }
  if (parsed.protocol !== "https:") throw new ApiRequestError("VALIDATION_ERROR", "Source URL must use HTTPS.");
  if (parsed.username.length > 0 || parsed.password.length > 0) throw new ApiRequestError("VALIDATION_ERROR", "Source URL must not include credentials.");
  return parsed;
}

function exceedsDeclaredLength(headers: Headers, maxBytes: number): boolean {
  const declaredLength = Number(headers.get("content-length"));
  return Number.isFinite(declaredLength) && declaredLength > maxBytes;
}

async function readBytesLimited(body: ReadableStream<Uint8Array> | null, maxBytes: number, code: ApiErrorCode, oversizeMessage: string, unreadableMessage: string): Promise<Uint8Array> {
  const reader = body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    try {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) {
        void reader.cancel();
        throw new ApiRequestError(code, oversizeMessage);
      }
      chunks.push(result.value);
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      void reader.cancel(error);
      throw new ApiRequestError(code, unreadableMessage);
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
