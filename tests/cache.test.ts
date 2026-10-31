import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compilationCacheKey, MemoryCache } from "@/lib/cache";

// The module marks itself server-only; tests run under plain Node resolution.
vi.mock("server-only", () => ({}));

const keyInput = {
  sourceContent: "Synthetic programme text used only for cache tests.",
  model: "open-weight/proposed-model",
  promptVersion: "v0-foundation",
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function liveCache(): MemoryCache<string> {
  return new MemoryCache<string>({ ttlMs: 1_000_000, maxEntries: 10 });
}

describe("compilationCacheKey", () => {
  it("is deterministic and produces a SHA-256 hex digest", () => {
    const first = compilationCacheKey(keyInput);
    const second = compilationCacheKey({ ...keyInput });
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never collides on ambiguous field boundaries", () => {
    const delimiterJoined = ["alpha|beta", "gamma", "v1"].join("|");
    expect(delimiterJoined).toBe(["alpha", "beta|gamma", "v1"].join("|"));
    const first = compilationCacheKey({ sourceContent: "alpha|beta", model: "gamma", promptVersion: "v1" });
    const second = compilationCacheKey({ sourceContent: "alpha", model: "beta|gamma", promptVersion: "v1" });
    expect(first).not.toBe(second);
  });

  it("changes whenever the source content changes", () => {
    const baseline = compilationCacheKey(keyInput);
    expect(compilationCacheKey({ ...keyInput, sourceContent: `${keyInput.sourceContent} updated` })).not.toBe(baseline);
    expect(compilationCacheKey({ ...keyInput, sourceContent: keyInput.sourceContent.toUpperCase() })).not.toBe(baseline);
  });

  it("changes whenever the model identifier changes", () => {
    const baseline = compilationCacheKey(keyInput);
    expect(compilationCacheKey({ ...keyInput, model: "open-weight/other-model" })).not.toBe(baseline);
  });

  it("changes whenever the prompt version changes", () => {
    const baseline = compilationCacheKey(keyInput);
    expect(compilationCacheKey({ ...keyInput, promptVersion: "v1-next" })).not.toBe(baseline);
  });

  it("rejects empty model or prompt version values", () => {
    expect(() => compilationCacheKey({ ...keyInput, model: "  " })).toThrow(/model and promptVersion/);
    expect(() => compilationCacheKey({ ...keyInput, promptVersion: "" })).toThrow(/model and promptVersion/);
  });
});

describe("MemoryCache hits and misses", () => {
  it("returns stored values on hit and undefined on miss", () => {
    const cache = liveCache();
    const key = compilationCacheKey(keyInput);
    expect(cache.get(key)).toBeUndefined();
    expect(cache.has(key)).toBe(false);
    cache.set(key, "compiled-requirements");
    expect(cache.get(key)).toBe("compiled-requirements");
    expect(cache.has(key)).toBe(true);
    expect(cache.size).toBe(1);
  });

  it("keeps distinct keys isolated and updateable", () => {
    const cache = liveCache();
    const first = compilationCacheKey(keyInput);
    const second = compilationCacheKey({ ...keyInput, sourceContent: "Different synthetic source." });
    cache.set(first, "first");
    cache.set(second, "second");
    expect(cache.get(first)).toBe("first");
    expect(cache.get(second)).toBe("second");
    cache.set(first, "first updated");
    expect(cache.get(first)).toBe("first updated");
    expect(cache.get(second)).toBe("second");
    expect(cache.size).toBe(2);
  });
});

describe("MemoryCache TTL expiry", () => {
  it("never returns an expired entry", () => {
    vi.setSystemTime(new Date("2026-10-31T00:00:00Z"));
    const cache = new MemoryCache<string>({ ttlMs: 1_000, maxEntries: 10 });
    const key = compilationCacheKey(keyInput);
    cache.set(key, "value");
    vi.advanceTimersByTime(999);
    expect(cache.get(key)).toBe("value");
    vi.advanceTimersByTime(1);
    expect(cache.get(key)).toBeUndefined();
    expect(cache.has(key)).toBe(false);
    expect(cache.size).toBe(0);
  });

  it("refreshes the expiry when a key is set again", () => {
    const cache = new MemoryCache<string>({ ttlMs: 1_000, maxEntries: 10 });
    const key = compilationCacheKey(keyInput);
    cache.set(key, "first");
    vi.advanceTimersByTime(600);
    cache.set(key, "second");
    vi.advanceTimersByTime(600);
    expect(cache.get(key)).toBe("second");
    expect(cache.size).toBe(1);
  });
});

describe("MemoryCache eviction", () => {
  it("evicts the least recently used entry beyond capacity", () => {
    const cache = new MemoryCache<string>({ ttlMs: 1_000_000, maxEntries: 2 });
    cache.set("a", "a");
    cache.set("b", "b");
    expect(cache.get("a")).toBe("a");
    cache.set("c", "c");
    expect(cache.get("a")).toBe("a");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe("c");
    expect(cache.size).toBe(2);
  });

  it("evicts the oldest entry when nothing was read", () => {
    const cache = new MemoryCache<string>({ ttlMs: 1_000_000, maxEntries: 2 });
    cache.set("a", "a");
    cache.set("b", "b");
    cache.set("c", "c");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("b");
    expect(cache.get("c")).toBe("c");
  });

  it("frees capacity by purging expired entries before evicting live ones", () => {
    const cache = new MemoryCache<string>({ ttlMs: 1_000, maxEntries: 2 });
    cache.set("expiring", "soon");
    vi.advanceTimersByTime(2_000);
    cache.set("first", "1");
    cache.set("second", "2");
    expect(cache.get("expiring")).toBeUndefined();
    expect(cache.get("first")).toBe("1");
    expect(cache.get("second")).toBe("2");
    expect(cache.size).toBe(2);
  });

  it("replaces an existing key without evicting another entry", () => {
    const cache = new MemoryCache<string>({ ttlMs: 1_000_000, maxEntries: 2 });
    cache.set("a", "a");
    cache.set("b", "b");
    cache.set("a", "a2");
    expect(cache.get("a")).toBe("a2");
    expect(cache.get("b")).toBe("b");
    expect(cache.size).toBe(2);
  });
});

describe("isolation between models and prompt versions", () => {
  it("keeps model variants in separate entries of the same cache", () => {
    const cache = liveCache();
    const modelA = compilationCacheKey(keyInput);
    const modelB = compilationCacheKey({ ...keyInput, model: "open-weight/other-model" });
    const promptV1 = compilationCacheKey({ ...keyInput, promptVersion: "v1-next" });
    cache.set(modelA, "compiled by model A");
    cache.set(modelB, "compiled by model B");
    cache.set(promptV1, "compiled with prompt v1");
    expect(cache.get(modelA)).toBe("compiled by model A");
    expect(cache.get(modelB)).toBe("compiled by model B");
    expect(cache.get(promptV1)).toBe("compiled with prompt v1");
  });

  it("misses when only the model or prompt version changed after a set", () => {
    const cache = liveCache();
    cache.set(compilationCacheKey(keyInput), "cache entry value");
    expect(cache.get(compilationCacheKey({ ...keyInput, model: "open-weight/other-model" }))).toBeUndefined();
    expect(cache.get(compilationCacheKey({ ...keyInput, promptVersion: "v1-next" }))).toBeUndefined();
    expect(cache.get(compilationCacheKey({ ...keyInput, sourceContent: "Changed synthetic source." }))).toBeUndefined();
  });
});

describe("cache maintenance", () => {
  it("rejects invalid TTL and capacity options", () => {
    expect(() => new MemoryCache<string>({ ttlMs: 0, maxEntries: 10 })).toThrow(/Cache TTL/);
    expect(() => new MemoryCache<string>({ ttlMs: 1_000.5, maxEntries: 10 })).toThrow(/Cache TTL/);
    expect(() => new MemoryCache<string>({ ttlMs: 1_000, maxEntries: 0 })).toThrow(/Cache capacity/);
    expect(() => new MemoryCache<string>({ ttlMs: 1_000, maxEntries: 2.5 })).toThrow(/Cache capacity/);
  });

  it("supports delete, clear, and absence checks", () => {
    const cache = liveCache();
    cache.set("a", "a");
    cache.set("b", "b");
    expect(cache.delete("a")).toBe(true);
    expect(cache.delete("a")).toBe(false);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("b");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("b")).toBeUndefined();
  });
});
