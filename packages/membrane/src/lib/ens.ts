/**
 * ENS Integration for Universe Discovery
 *
 * Provides human-readable names for universes and worlds:
 * - outora.fab.eth → ipfs://<universe.yaml CID>
 * - library.outora.fab.eth → ipfs://<world.yaml CID>
 *
 * Uses ENS contenthash for IPFS resolution.
 */

import {
  createPublicClient,
  http,
  type PublicClient,
  type Chain,
  namehash,
  labelhash,
} from "viem";
import { mainnet, sepolia } from "viem/chains";
import { normalize } from "viem/ens";

// ENS chain configurations
const ENS_CHAINS: Record<string, Chain> = {
  mainnet,
  sepolia,
};

// Public ENS resolver addresses
const ENS_RESOLVERS = {
  mainnet: "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63", // ENS Public Resolver
  sepolia: "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD", // Sepolia resolver
};

// Contenthash codec prefixes (for future binary contenthash parsing)
// const IPFS_CODEC = 0xe3; // IPFS (CIDv0/CIDv1)
// const IPNS_CODEC = 0xe5; // IPNS

/**
 * Universe resolution result
 */
export interface UniverseResolution {
  name: string;
  contentHash: string | null;
  ipfsCid: string | null;
  address: string | null;
  resolver: string | null;
}

/**
 * Create an ENS-enabled public client
 */
export function createEnsClient(
  chain: "mainnet" | "sepolia" = "mainnet"
): PublicClient {
  return createPublicClient({
    chain: ENS_CHAINS[chain],
    transport: http(),
  });
}

/**
 * Resolve an ENS name to its contenthash (IPFS CID)
 */
export async function resolveContentHash(
  client: PublicClient,
  ensName: string
): Promise<string | null> {
  try {
    const normalizedName = normalize(ensName);
    const contentHash = await client.getEnsText({
      name: normalizedName,
      key: "contenthash",
    });

    // If no contenthash text record, try the actual contenthash
    if (!contentHash) {
      // Note: viem doesn't have direct contenthash support,
      // we'd need to call the resolver contract directly
      return null;
    }

    return contentHash;
  } catch {
    return null;
  }
}

/**
 * Resolve an ENS name to an Ethereum address
 */
export async function resolveAddress(
  client: PublicClient,
  ensName: string
): Promise<string | null> {
  try {
    const normalizedName = normalize(ensName);
    const address = await client.getEnsAddress({
      name: normalizedName,
    });
    return address ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve a universe name to its IPFS metadata
 */
export async function resolveUniverse(
  ensName: string,
  chain: "mainnet" | "sepolia" = "mainnet"
): Promise<UniverseResolution> {
  const client = createEnsClient(chain);
  const normalizedName = normalize(ensName);

  const [contentHash, address] = await Promise.all([
    resolveContentHash(client, normalizedName),
    resolveAddress(client, normalizedName),
  ]);

  // Parse IPFS CID from contenthash if available
  let ipfsCid: string | null = null;
  if (contentHash) {
    // Contenthash may be in various formats:
    // - ipfs://QmXxx...
    // - /ipfs/QmXxx...
    // - QmXxx... (bare CID)
    if (contentHash.startsWith("ipfs://")) {
      ipfsCid = contentHash.slice(7);
    } else if (contentHash.startsWith("/ipfs/")) {
      ipfsCid = contentHash.slice(6);
    } else if (contentHash.startsWith("Qm") || contentHash.startsWith("bafy")) {
      ipfsCid = contentHash;
    }
  }

  return {
    name: normalizedName,
    contentHash,
    ipfsCid,
    address,
    resolver: ENS_RESOLVERS[chain],
  };
}

/**
 * Get the IPFS gateway URL for a universe
 */
export function getUniverseGatewayUrl(
  ipfsCid: string,
  gateway: string = "https://w3s.link/ipfs"
): string {
  return `${gateway}/${ipfsCid}`;
}

/**
 * Resolve a universe and fetch its metadata from IPFS
 */
export async function fetchUniverseMetadata(
  ensName: string,
  chain: "mainnet" | "sepolia" = "mainnet",
  gateway: string = "https://w3s.link/ipfs"
): Promise<{
  resolution: UniverseResolution;
  metadata: Record<string, unknown> | null;
  error?: string;
}> {
  const resolution = await resolveUniverse(ensName, chain);

  if (!resolution.ipfsCid) {
    return {
      resolution,
      metadata: null,
      error: "No IPFS contenthash found for this ENS name",
    };
  }

  try {
    const url = getUniverseGatewayUrl(resolution.ipfsCid, gateway);
    const response = await fetch(url);

    if (!response.ok) {
      return {
        resolution,
        metadata: null,
        error: `Failed to fetch from IPFS: ${response.statusText}`,
      };
    }

    const metadata = (await response.json()) as Record<string, unknown>;
    return { resolution, metadata };
  } catch (error) {
    return {
      resolution,
      metadata: null,
      error: error instanceof Error ? error.message : "Failed to fetch metadata",
    };
  }
}

/**
 * Check if an ENS name is available for registration
 */
export async function isNameAvailable(
  client: PublicClient,
  ensName: string
): Promise<boolean> {
  try {
    const address = await resolveAddress(client, ensName);
    return address === null;
  } catch {
    return true; // Assume available if resolution fails
  }
}

/**
 * Get ENS avatar URL if set
 */
export async function getAvatar(
  client: PublicClient,
  ensName: string
): Promise<string | null> {
  try {
    const normalizedName = normalize(ensName);
    const avatar = await client.getEnsAvatar({
      name: normalizedName,
    });
    return avatar ?? null;
  } catch {
    return null;
  }
}

/**
 * Get all text records for an ENS name
 */
export async function getTextRecords(
  client: PublicClient,
  ensName: string,
  keys: string[] = ["description", "url", "com.twitter", "com.github"]
): Promise<Record<string, string | null>> {
  const normalizedName = normalize(ensName);
  const results: Record<string, string | null> = {};

  await Promise.all(
    keys.map(async (key) => {
      try {
        const value = await client.getEnsText({
          name: normalizedName,
          key,
        });
        results[key] = value ?? null;
      } catch {
        results[key] = null;
      }
    })
  );

  return results;
}

/**
 * Compute namehash for an ENS name (useful for contract interactions)
 */
export function computeNamehash(ensName: string): string {
  const normalizedName = normalize(ensName);
  return namehash(normalizedName);
}

/**
 * Compute labelhash for a single label (useful for subdomain registration)
 */
export function computeLabelhash(label: string): string {
  return labelhash(label);
}

/**
 * Parse a universe ENS name into its components
 * e.g., "library.outora.fab.eth" → { world: "library", universe: "outora", domain: "fab.eth" }
 */
export function parseUniverseName(ensName: string): {
  world?: string;
  universe: string;
  domain: string;
  isWorld: boolean;
} {
  const normalizedName = normalize(ensName);
  const parts = normalizedName.split(".");

  if (parts.length < 2) {
    throw new Error("Invalid ENS name format");
  }

  // fab.eth → universe at root
  if (parts.length === 2) {
    return {
      universe: parts[0],
      domain: parts.join("."),
      isWorld: false,
    };
  }

  // outora.fab.eth → universe
  if (parts.length === 3) {
    return {
      universe: parts[0],
      domain: parts.slice(1).join("."),
      isWorld: false,
    };
  }

  // library.outora.fab.eth → world within universe
  return {
    world: parts[0],
    universe: parts[1],
    domain: parts.slice(2).join("."),
    isWorld: true,
  };
}
