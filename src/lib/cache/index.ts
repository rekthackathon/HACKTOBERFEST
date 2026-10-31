import "server-only";

import { createHash } from "node:crypto";

/**
 * Per-process in-memory caching helpers for expensive AI rule compilation.
 *
 * Scope note: this cache lives only in the memory of the running process. In
 * serverless or multi-instance deployments every instance keeps its own cache;
 * keys, TTLs, and evictions are never shared across instances or restarts.
 * Treat every miss as a normal signal to recompile, and never use this cache as
 * durable storage or as the only copy of a compilation result.
 *
 * Cache keys combine the full source content, the exact model identifier, and
 * the prompt version, so any change to any of the three forces a fresh
 * compilation instead of reusing a stale entry.
 */

export type CompilationCacheKeyInput = {
  /** Full programme source text; every byte change produces a new key. */
  sourceContent: string;
  /** Exact provider model identifier recorded for the compilation. */
  model: string;
  /** Prompt version recorded for the compilation. */
  promptVersion: string;
};

const encoder = new TextEncoder();

/** Encodes one field as an 8-hex-digit UTF-8 byte length followed by its bytes, so field boundaries are unambiguous. */
function lengthPrefixedBytes(value: string): Uint8Array {
  const bytes = encoder.encode(value);
  const prefix = encoder.encode(bytes.byteLength.toString(16).padStart(8, "0"));
  const encoded = new Uint8Array(prefix.byteLength + bytes.byteLength);
  encoded.set(prefix, 0);
  encoded.set(bytes, prefix.byteLength);
  return encoded;
}

/**
 * Derives a deterministic SHA-256 cache key from source content, model, and
 * prompt version. Identical inputs always produce the same key, and changing
 * any single input produces a different one. Delimiters inside the inputs
 * cannot collide because every field is length-prefixed.
 */
export function compilationCacheKey(input: CompilationCacheKeyInput): string {
  const model = input.model.trim();
  const promptVersion = input.promptVersion.trim();
  if (model.length === 0 || promptVersion.length === 0) {
    throw new Error("Cache key model and promptVersion must be non-empty.");
  }
  const hash = createHash("sha256");
  hash.update(lengthPrefixedBytes(input.sourceContent));
  hash.update(lengthPrefixedBytes(model));
  hash.update(lengthPrefixedBytes(promptVersion));
  return hash.digest("hex");
}

export type MemoryCacheOptions = {
  /** Entry lifetime in milliseconds. Must be a positive integer. */
  ttlMs: number;
  /** Maximum number of live entries. Must be at least one. */
  maxEntries: number;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

/**
 * Reusable in-memory cache with per-entry TTL and a capacity bound.
 * Values belong to the current process only; see the module note about
 * serverless deployment scope. Expired entries are never returned, and the
 * least recently used live entry is evicted once capacity is exceeded.
 */
export class MemoryCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  readonly ttlMs: number;
  readonly maxEntries: number;

  constructor(options: MemoryCacheOptions) {
    const { ttlMs, maxEntries } = options;
    if (!Number.isInteger(ttlMs) || ttlMs <= 0) throw new Error("Cache TTL must be a positive integer number of milliseconds.");
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error("Cache capacity must be at least one entry.");
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  /** Returns the cached value or undefined for unknown and expired keys; a hit refreshes recency. */
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /** Returns whether a live (non-expired) entry exists without refreshing recency. */
  has(key: string): boolean {
    const entry = this.entries.get(key);
    if (entry === undefined) return false;
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  /** Stores or replaces a value with a fresh expiry, then enforces the capacity bound. */
  set(key: string, value: T): void {
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    this.enforceCapacity();
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  /** Number of live entries; expired entries are purged before counting. */
  get size(): number {
    this.purgeExpired();
    return this.entries.size;
  }

  private enforceCapacity(): void {
    this.purgeExpired();
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) return;
      this.entries.delete(oldest.value);
    }
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now >= entry.expiresAt) this.entries.delete(key);
    }
  }
}
