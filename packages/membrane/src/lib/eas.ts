/**
 * EAS (Ethereum Attestation Service) integration
 *
 * Supports both offchain and onchain attestations.
 * Uses viem for signing and EAS SDK for attestation creation.
 */

import { keccak256, toHex } from "viem";
import { EAS, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { ethers } from "ethers";
import { getConfig } from "./config.js";
import { canonicalize } from "./canonical.js";
import type { RunReceiptInput } from "../types/receipt.js";
import {
  EAS_SCHEMA_STRING,
  SUPPORTED_CHAINS,
  type AttestationData,
} from "../types/attestation.js";

/**
 * Check if EAS is configured
 */
export function isConfigured(): boolean {
  const config = getConfig();
  return !!(config.schemaUid && process.env.MEMBRANE_PRIVATE_KEY);
}

/**
 * Get configured EAS instance
 */
async function getEAS() {
  const config = getConfig();
  const chainConfig = SUPPORTED_CHAINS[config.chain];

  if (!chainConfig) {
    throw new Error(`Unsupported chain: ${config.chain}`);
  }

  // Create ethers provider and signer for EAS SDK
  const privateKey = process.env.MEMBRANE_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("MEMBRANE_PRIVATE_KEY not set");
  }

  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  const eas = new EAS(chainConfig.easContractAddress);
  eas.connect(signer);

  return { eas, signer, chainConfig };
}

/**
 * Encode receipt data for attestation
 */
function encodeReceiptData(receipt: RunReceiptInput, cid: string): AttestationData {
  return {
    universeId: receipt.universe.id,
    worldId: receipt.world.id,
    runId: receipt.run.id,
    manifestHash: receipt.artifacts.manifest_hash,
    artifactsCid: cid,
    passed: receipt.verdict.passed,
  };
}

/**
 * Create an offchain attestation
 *
 * @param receipt - The run receipt to attest
 * @param cid - IPFS CID of the artifacts
 * @returns Attestation UID and signature
 */
export async function createAttestation(
  receipt: RunReceiptInput,
  cid: string
): Promise<{ uid: string; signature: string }> {
  const config = getConfig();
  const { eas, signer } = await getEAS();

  if (!config.schemaUid) {
    throw new Error("Schema UID not configured");
  }

  // Encode the attestation data
  const schemaEncoder = new SchemaEncoder(EAS_SCHEMA_STRING);
  const data = encodeReceiptData(receipt, cid);

  const encodedData = schemaEncoder.encodeData([
    { name: "universeId", value: data.universeId, type: "string" },
    { name: "worldId", value: data.worldId, type: "string" },
    { name: "runId", value: data.runId, type: "string" },
    { name: "manifestHash", value: data.manifestHash, type: "bytes32" },
    { name: "artifactsCid", value: keccak256(toHex(data.artifactsCid)), type: "bytes32" },
    { name: "passed", value: data.passed, type: "bool" },
  ]);

  // Create offchain attestation
  const offchain = await eas.getOffchain();

  const attestation = await offchain.signOffchainAttestation(
    {
      schema: config.schemaUid,
      recipient: "0x0000000000000000000000000000000000000000", // No specific recipient
      time: BigInt(Math.floor(Date.now() / 1000)),
      expirationTime: BigInt(0), // No expiration
      revocable: true,
      refUID: "0x0000000000000000000000000000000000000000000000000000000000000000",
      data: encodedData,
    },
    signer
  );

  // Compute attestation UID
  const uid = keccak256(
    toHex(
      canonicalize({
        schema: config.schemaUid,
        data: encodedData,
        time: attestation.message.time.toString(),
      })
    )
  );

  return {
    uid,
    signature: JSON.stringify(attestation),
  };
}

/**
 * Create an onchain attestation (costs gas)
 */
export async function createOnchainAttestation(
  receipt: RunReceiptInput,
  cid: string
): Promise<{ uid: string; txHash: string }> {
  const config = getConfig();
  const { eas } = await getEAS();

  if (!config.schemaUid) {
    throw new Error("Schema UID not configured");
  }

  // Encode the attestation data
  const schemaEncoder = new SchemaEncoder(EAS_SCHEMA_STRING);
  const data = encodeReceiptData(receipt, cid);

  const encodedData = schemaEncoder.encodeData([
    { name: "universeId", value: data.universeId, type: "string" },
    { name: "worldId", value: data.worldId, type: "string" },
    { name: "runId", value: data.runId, type: "string" },
    { name: "manifestHash", value: data.manifestHash, type: "bytes32" },
    { name: "artifactsCid", value: keccak256(toHex(data.artifactsCid)), type: "bytes32" },
    { name: "passed", value: data.passed, type: "bool" },
  ]);

  const tx = await eas.attest({
    schema: config.schemaUid,
    data: {
      recipient: "0x0000000000000000000000000000000000000000",
      expirationTime: BigInt(0),
      revocable: true,
      refUID: "0x0000000000000000000000000000000000000000000000000000000000000000",
      data: encodedData,
      value: BigInt(0),
    },
  });

  const uid = await tx.wait();

  return {
    uid,
    txHash: tx.receipt?.hash ?? "",
  };
}

/**
 * Verify an attestation
 */
export async function verifyAttestation(uid: string): Promise<{
  valid: boolean;
  receipt?: Record<string, unknown>;
  attestedAt?: string;
  attester?: string;
  error?: string;
}> {
  const { eas } = await getEAS();

  try {
    const attestation = await eas.getAttestation(uid);

    if (!attestation) {
      return { valid: false, error: "Attestation not found" };
    }

    if (attestation.revocationTime > 0n) {
      return { valid: false, error: "Attestation has been revoked" };
    }

    // Decode the data
    const schemaEncoder = new SchemaEncoder(EAS_SCHEMA_STRING);
    const decoded = schemaEncoder.decodeData(attestation.data);

    const receipt: Record<string, unknown> = {};
    for (const item of decoded) {
      receipt[item.name] = item.value.value;
    }

    return {
      valid: true,
      receipt,
      attestedAt: new Date(Number(attestation.time) * 1000).toISOString(),
      attester: attestation.attester,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Verification failed",
    };
  }
}
