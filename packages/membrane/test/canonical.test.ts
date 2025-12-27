import { describe, it, expect } from "vitest";
import { canonicalize, hashObject, verifyHash, sha256 } from "../src/lib/canonical.js";

describe("canonicalize", () => {
  it("should sort object keys alphabetically", () => {
    const input = { z: 1, a: 2, m: 3 };
    const result = canonicalize(input);
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  it("should handle nested objects", () => {
    const input = { outer: { z: 1, a: 2 }, first: "value" };
    const result = canonicalize(input);
    expect(result).toBe('{"first":"value","outer":{"a":2,"z":1}}');
  });

  it("should handle arrays (preserve order, sort elements if objects)", () => {
    const input = { items: [{ z: 1, a: 2 }, { b: 3 }] };
    const result = canonicalize(input);
    expect(result).toBe('{"items":[{"a":2,"z":1},{"b":3}]}');
  });

  it("should handle null values", () => {
    const input = { a: null, b: 1 };
    const result = canonicalize(input);
    expect(result).toBe('{"a":null,"b":1}');
  });

  it("should omit undefined values", () => {
    const input = { a: undefined, b: 1 };
    const result = canonicalize(input);
    expect(result).toBe('{"b":1}');
  });

  it("should handle boolean values", () => {
    const input = { passed: true, failed: false };
    const result = canonicalize(input);
    expect(result).toBe('{"failed":false,"passed":true}');
  });

  it("should handle numbers", () => {
    const input = { score: 0.95, count: 42 };
    const result = canonicalize(input);
    expect(result).toBe('{"count":42,"score":0.95}');
  });

  it("should handle empty objects", () => {
    expect(canonicalize({})).toBe("{}");
  });

  it("should handle empty arrays", () => {
    expect(canonicalize([])).toBe("[]");
  });

  it("should handle deeply nested structures", () => {
    const input = {
      level1: {
        level2: {
          level3: {
            z: 1,
            a: 2,
          },
        },
      },
    };
    const result = canonicalize(input);
    expect(result).toBe('{"level1":{"level2":{"level3":{"a":2,"z":1}}}}');
  });
});

describe("hashObject", () => {
  it("should return consistent hash for same object", () => {
    const obj = { a: 1, b: 2 };
    const hash1 = hashObject(obj);
    const hash2 = hashObject(obj);
    expect(hash1).toBe(hash2);
  });

  it("should return same hash regardless of key order", () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { b: 2, a: 1 };
    expect(hashObject(obj1)).toBe(hashObject(obj2));
  });

  it("should return different hash for different objects", () => {
    const obj1 = { a: 1 };
    const obj2 = { a: 2 };
    expect(hashObject(obj1)).not.toBe(hashObject(obj2));
  });

  it("should return 0x-prefixed hex string", () => {
    const hash = hashObject({ test: true });
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
  });
});

describe("verifyHash", () => {
  it("should return true for matching hash", () => {
    const obj = { a: 1, b: 2 };
    const hash = hashObject(obj);
    expect(verifyHash(obj, hash)).toBe(true);
  });

  it("should return false for non-matching hash", () => {
    const obj = { a: 1, b: 2 };
    const wrongHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
    expect(verifyHash(obj, wrongHash)).toBe(false);
  });

  it("should be case-insensitive for hash comparison", () => {
    const obj = { test: 123 };
    const hash = hashObject(obj);
    expect(verifyHash(obj, hash.toUpperCase())).toBe(true);
  });
});

describe("sha256", () => {
  it("should hash a string", async () => {
    const hash = await sha256("hello");
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it("should return consistent hash for same input", async () => {
    const hash1 = await sha256("test");
    const hash2 = await sha256("test");
    expect(hash1).toBe(hash2);
  });

  it("should return different hash for different input", async () => {
    const hash1 = await sha256("a");
    const hash2 = await sha256("b");
    expect(hash1).not.toBe(hash2);
  });

  it("should match known SHA256 value", async () => {
    // SHA256 of "hello" is well-known
    const hash = await sha256("hello");
    expect(hash).toBe(
      "0x2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });
});

describe("RunReceipt canonicalization", () => {
  it("should produce deterministic hash for run receipt", () => {
    const receipt = {
      version: "0.1.0",
      universe: { id: "cyntra-fab", name: "Cyntra Fab" },
      world: { id: "outora-library", name: "Outora Library" },
      run: {
        id: "20231215-abc123",
        timestamp: "2023-12-15T10:30:00Z",
        git_sha: "a".repeat(40),
        toolchain: "blender",
      },
      artifacts: {
        manifest_hash: "0x" + "a".repeat(64),
      },
      verdict: {
        passed: true,
      },
    };

    const hash1 = hashObject(receipt);
    const hash2 = hashObject(receipt);
    expect(hash1).toBe(hash2);
  });

  it("should produce same hash with different property order", () => {
    const receipt1 = {
      version: "0.1.0",
      universe: { id: "test", name: "Test" },
      verdict: { passed: true },
    };

    const receipt2 = {
      verdict: { passed: true },
      version: "0.1.0",
      universe: { name: "Test", id: "test" },
    };

    expect(hashObject(receipt1)).toBe(hashObject(receipt2));
  });
});
