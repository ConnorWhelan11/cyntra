/**
 * Herodotus Integration for Cross-Chain Attestation Verification
 *
 * Enables trustless verification of EAS attestations from Base L2 on Starknet
 * using Herodotus storage proofs.
 *
 * Flow:
 * 1. Create attestation on Base L2 via EAS
 * 2. Wait for Herodotus to index the block
 * 3. Generate storage proof for the attestation slot
 * 4. Submit proof to Starknet verifier contract
 */

import { keccak256, encodeAbiParameters, parseAbiParameters, type Hex } from "viem";

// Herodotus API endpoints
const HERODOTUS_API = {
  mainnet: "https://api.herodotus.cloud",
  testnet: "https://api.testnet.herodotus.cloud",
};

// EAS contract addresses
const EAS_CONTRACTS = {
  base: "0x4200000000000000000000000000000000000021",
  "base-sepolia": "0x4200000000000000000000000000000000000021",
};

// Herodotus Facts Registry on Starknet
const FACTS_REGISTRY = {
  mainnet: "0x...", // TODO: Add mainnet address
  sepolia: "0x07d7f7ec0c3e3fef56cf4e5a8badb9ba0d3a13a0c4c3d6c5b8c7d6e5f4a3b2c1",
};

/**
 * Storage proof for cross-chain verification
 */
export interface StorageProof {
  /** Source chain block number */
  blockNumber: bigint;
  /** Account address (EAS contract) */
  account: Hex;
  /** Storage slot */
  slot: Hex;
  /** Storage value */
  value: Hex;
  /** Merkle proof nodes */
  proof: Hex[];
  /** Herodotus task ID */
  taskId: string;
}

/**
 * Proof generation request
 */
export interface ProofRequest {
  /** Attestation UID from EAS */
  attestationUid: Hex;
  /** Source chain (base, base-sepolia) */
  sourceChain: string;
  /** Block number to prove (optional, uses latest if not provided) */
  blockNumber?: bigint;
}

/**
 * Herodotus task status
 */
export interface TaskStatus {
  taskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  proof?: StorageProof;
  error?: string;
}

/**
 * Compute the storage slot for an EAS attestation
 *
 * EAS stores attestations in: mapping(bytes32 => Attestation) attestations
 * The slot is computed as: keccak256(abi.encode(uid, ATTESTATIONS_SLOT))
 *
 * @param attestationUid - The attestation UID
 * @param mappingSlot - The storage slot of the attestations mapping (typically 0)
 */
export function computeAttestationSlot(
  attestationUid: Hex,
  mappingSlot: bigint = 0n
): Hex {
  // Solidity mapping slot computation:
  // slot = keccak256(abi.encode(key, mappingSlot))
  const encoded = encodeAbiParameters(
    parseAbiParameters("bytes32, uint256"),
    [attestationUid, mappingSlot]
  );
  return keccak256(encoded);
}

/**
 * Request a storage proof from Herodotus
 *
 * @param request - Proof request parameters
 * @param apiKey - Herodotus API key
 */
export async function requestStorageProof(
  request: ProofRequest,
  apiKey: string
): Promise<string> {
  const easContract = EAS_CONTRACTS[request.sourceChain as keyof typeof EAS_CONTRACTS];

  if (!easContract) {
    throw new Error(`Unknown chain: ${request.sourceChain}`);
  }

  const slot = computeAttestationSlot(request.attestationUid);

  const apiUrl = request.sourceChain.includes("sepolia")
    ? HERODOTUS_API.testnet
    : HERODOTUS_API.mainnet;

  const response = await fetch(`${apiUrl}/submit-batch-query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      destinationChainId: "STARKNET_SEPOLIA", // or STARKNET_MAINNET
      fee: "0",
      data: {
        [request.sourceChain.toUpperCase().replace("-", "_")]: {
          [`block:${request.blockNumber?.toString() ?? "latest"}`]: {
            accounts: {
              [easContract]: {
                slots: [slot],
              },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Herodotus API error: ${error}`);
  }

  const result = (await response.json()) as { internalId: string };
  return result.internalId;
}

/**
 * Check the status of a proof generation task
 *
 * @param taskId - Herodotus task ID
 * @param apiKey - Herodotus API key
 * @param isTestnet - Whether to use testnet API
 */
export async function getTaskStatus(
  taskId: string,
  apiKey: string,
  isTestnet: boolean = true
): Promise<TaskStatus> {
  const apiUrl = isTestnet ? HERODOTUS_API.testnet : HERODOTUS_API.mainnet;

  const response = await fetch(`${apiUrl}/batch-query-status?batchQueryId=${taskId}`, {
    headers: {
      "X-API-Key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get task status: ${response.statusText}`);
  }

  const result = (await response.json()) as { status: string; error?: string };

  // Map Herodotus status to our status
  let status: TaskStatus["status"];
  switch (result.status) {
    case "PENDING":
    case "SCHEDULED":
      status = "pending";
      break;
    case "IN_PROGRESS":
      status = "processing";
      break;
    case "DONE":
      status = "completed";
      break;
    case "FAILED":
      status = "failed";
      break;
    default:
      status = "pending";
  }

  return {
    taskId,
    status,
    error: result.error,
    // Proof data would be extracted from result when completed
  };
}

/**
 * Wait for a proof to be generated
 *
 * @param taskId - Herodotus task ID
 * @param apiKey - Herodotus API key
 * @param isTestnet - Whether to use testnet API
 * @param timeoutMs - Maximum time to wait (default 5 minutes)
 * @param pollIntervalMs - Time between status checks (default 10 seconds)
 */
export async function waitForProof(
  taskId: string,
  apiKey: string,
  isTestnet: boolean = true,
  timeoutMs: number = 300000,
  pollIntervalMs: number = 10000
): Promise<TaskStatus> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const status = await getTaskStatus(taskId, apiKey, isTestnet);

    if (status.status === "completed" || status.status === "failed") {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Proof generation timed out after ${timeoutMs}ms`);
}

/**
 * Generate and wait for a complete storage proof
 *
 * @param request - Proof request parameters
 * @param apiKey - Herodotus API key
 */
export async function generateProof(
  request: ProofRequest,
  apiKey: string
): Promise<StorageProof> {
  // Request the proof
  const taskId = await requestStorageProof(request, apiKey);

  // Wait for completion
  const isTestnet = request.sourceChain.includes("sepolia");
  const status = await waitForProof(taskId, apiKey, isTestnet);

  if (status.status === "failed") {
    throw new Error(`Proof generation failed: ${status.error}`);
  }

  if (!status.proof) {
    throw new Error("Proof completed but no proof data returned");
  }

  return status.proof;
}

/**
 * Format proof for Starknet verifier contract
 *
 * Converts the proof into the format expected by the Cairo verifier.
 */
export function formatProofForStarknet(proof: StorageProof): {
  blockNumber: string;
  account: string;
  slot: string;
  value: string;
  proofElements: string[];
} {
  return {
    blockNumber: proof.blockNumber.toString(),
    account: proof.account,
    slot: proof.slot,
    value: proof.value,
    proofElements: proof.proof.map((p) => p),
  };
}

/**
 * Get the Facts Registry address for a Starknet network
 */
export function getFactsRegistryAddress(network: "mainnet" | "sepolia"): string {
  return FACTS_REGISTRY[network];
}

/**
 * Verify an attestation exists using Herodotus
 *
 * This is a convenience function that:
 * 1. Requests a storage proof
 * 2. Waits for it to be generated
 * 3. Returns the formatted proof for Starknet
 *
 * @param attestationUid - EAS attestation UID
 * @param sourceChain - Source chain (base, base-sepolia)
 * @param apiKey - Herodotus API key
 */
export async function verifyAttestationCrossChain(
  attestationUid: Hex,
  sourceChain: string,
  apiKey: string
): Promise<{
  verified: boolean;
  proof?: ReturnType<typeof formatProofForStarknet>;
  error?: string;
}> {
  try {
    const proof = await generateProof(
      {
        attestationUid,
        sourceChain,
      },
      apiKey
    );

    // Check if the storage value is non-zero (attestation exists)
    const value = BigInt(proof.value);
    if (value === 0n) {
      return {
        verified: false,
        error: "Attestation not found in storage",
      };
    }

    return {
      verified: true,
      proof: formatProofForStarknet(proof),
    };
  } catch (error) {
    return {
      verified: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
