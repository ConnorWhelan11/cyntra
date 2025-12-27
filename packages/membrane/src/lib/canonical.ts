import { keccak256, toHex } from "viem";

/**
 * Canonicalize a JSON object for deterministic hashing.
 *
 * Rules:
 * 1. Object keys are sorted alphabetically (recursively)
 * 2. Numbers are normalized (no trailing zeros, scientific notation for large values)
 * 3. Strings are preserved exactly
 * 4. Arrays maintain order but elements are canonicalized
 * 5. null and boolean values are preserved
 * 6. undefined values are omitted
 *
 * This matches the Python implementation in kernel/src/cyntra/membrane/receipt.py
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

/**
 * Recursively sort object keys
 */
function sortKeys(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const key of keys) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) {
        sorted[key] = sortKeys(v);
      }
    }
    return sorted;
  }

  // Primitives: string, number, boolean
  return value;
}

/**
 * Compute keccak256 hash of canonicalized JSON
 *
 * @param obj - Object to hash
 * @returns 0x-prefixed hex string (66 chars)
 */
export function hashObject(obj: unknown): `0x${string}` {
  const canonical = canonicalize(obj);
  const bytes = new TextEncoder().encode(canonical);
  return keccak256(toHex(bytes));
}

/**
 * Compute SHA256 hash of a string or buffer
 *
 * @param data - String or Uint8Array to hash
 * @returns 0x-prefixed hex string (66 chars)
 */
export async function sha256(data: string | Uint8Array): Promise<`0x${string}`> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = new Uint8Array(hashBuffer);
  return `0x${Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Verify that a hash matches the expected value for an object
 */
export function verifyHash(obj: unknown, expectedHash: string): boolean {
  const actualHash = hashObject(obj);
  return actualHash.toLowerCase() === expectedHash.toLowerCase();
}
