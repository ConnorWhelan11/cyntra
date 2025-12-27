/**
 * Tests for Herodotus cross-chain verification
 */

import { describe, it, expect } from "bun:test";
import {
  computeAttestationSlot,
  formatProofForStarknet,
  type StorageProof,
} from "../src/lib/herodotus";

describe("computeAttestationSlot", () => {
  it("should compute a deterministic slot for an attestation UID", () => {
    const uid = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const slot1 = computeAttestationSlot(uid as `0x${string}`);
    const slot2 = computeAttestationSlot(uid as `0x${string}`);

    expect(slot1).toBe(slot2);
    expect(slot1).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it("should produce different slots for different UIDs", () => {
    const uid1 = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const uid2 = "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321";

    const slot1 = computeAttestationSlot(uid1 as `0x${string}`);
    const slot2 = computeAttestationSlot(uid2 as `0x${string}`);

    expect(slot1).not.toBe(slot2);
  });

  it("should support custom mapping slots", () => {
    const uid = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    const slot0 = computeAttestationSlot(uid as `0x${string}`, 0n);
    const slot1 = computeAttestationSlot(uid as `0x${string}`, 1n);

    expect(slot0).not.toBe(slot1);
  });
});

describe("formatProofForStarknet", () => {
  it("should format proof for Cairo contract", () => {
    const proof: StorageProof = {
      blockNumber: 12345678n,
      account: "0x4200000000000000000000000000000000000021",
      slot: "0xabc123",
      value: "0xdef456",
      proof: ["0x111", "0x222", "0x333"],
      taskId: "task-123",
    };

    const formatted = formatProofForStarknet(proof);

    expect(formatted.blockNumber).toBe("12345678");
    expect(formatted.account).toBe(proof.account);
    expect(formatted.slot).toBe(proof.slot);
    expect(formatted.value).toBe(proof.value);
    expect(formatted.proofElements).toEqual(proof.proof);
  });

  it("should handle large block numbers", () => {
    const proof: StorageProof = {
      blockNumber: 999999999999n,
      account: "0x4200000000000000000000000000000000000021",
      slot: "0xabc123",
      value: "0xdef456",
      proof: [],
      taskId: "task-123",
    };

    const formatted = formatProofForStarknet(proof);

    expect(formatted.blockNumber).toBe("999999999999");
  });
});

describe("storage slot computation", () => {
  it("should produce valid keccak256 hash format", () => {
    const uid = "0x0000000000000000000000000000000000000000000000000000000000000001";
    const slot = computeAttestationSlot(uid as `0x${string}`);

    // Should be 32 bytes (64 hex chars + 0x prefix)
    expect(slot.length).toBe(66);
    expect(slot.startsWith("0x")).toBe(true);
  });
});
