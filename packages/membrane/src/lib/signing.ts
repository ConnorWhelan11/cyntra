/**
 * Signing utilities using viem
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  verifyMessage,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia, optimism, optimismSepolia } from "viem/chains";
import { getConfig } from "./config.js";

// Chain mapping
const CHAINS = {
  base,
  "base-sepolia": baseSepolia,
  optimism,
  "optimism-sepolia": optimismSepolia,
} as const;

// Internal function - not exported to avoid complex type serialization
function _getWalletClient() {
  const config = getConfig();
  const privateKey = process.env.MEMBRANE_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("MEMBRANE_PRIVATE_KEY not set");
  }

  const chain = CHAINS[config.chain as keyof typeof CHAINS];
  if (!chain) {
    throw new Error(`Unsupported chain: ${config.chain}`);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  return createWalletClient({
    account,
    chain,
    transport: http(config.chainConfig.rpcUrl),
  });
}

// Internal function - not exported to avoid complex type serialization
function _getPublicClient() {
  const config = getConfig();

  const chain = CHAINS[config.chain as keyof typeof CHAINS];
  if (!chain) {
    throw new Error(`Unsupported chain: ${config.chain}`);
  }

  return createPublicClient({
    chain,
    transport: http(config.chainConfig.rpcUrl),
  });
}

/**
 * Get configured wallet client for signing
 * @returns Wallet client configured for the membrane chain
 */
export function getWalletClient(): unknown {
  return _getWalletClient();
}

/**
 * Get configured public client for reading
 * @returns Public client configured for the membrane chain
 */
export function getPublicClient(): unknown {
  return _getPublicClient();
}

/**
 * Sign a message
 */
export async function signMessage(message: string): Promise<Hash> {
  const client = _getWalletClient();
  return client.signMessage({ account: client.account!, message });
}

/**
 * Verify a signed message
 */
export async function verifySignedMessage(
  message: string,
  signature: Hash,
  address: Address
): Promise<boolean> {
  return verifyMessage({
    address,
    message,
    signature,
  });
}

/**
 * Get the signer's address
 */
export function getSignerAddress(): Address {
  const privateKey = process.env.MEMBRANE_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("MEMBRANE_PRIVATE_KEY not set");
  }
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  return account.address;
}

/**
 * EIP-712 typed data domain for membrane attestations
 */
export const MEMBRANE_DOMAIN = {
  name: "Membrane",
  version: "1",
  // chainId will be set dynamically
} as const;

/**
 * EIP-712 types for RunReceipt
 */
export const RUN_RECEIPT_TYPES = {
  RunReceipt: [
    { name: "universeId", type: "string" },
    { name: "worldId", type: "string" },
    { name: "runId", type: "string" },
    { name: "manifestHash", type: "bytes32" },
    { name: "artifactsCid", type: "string" },
    { name: "passed", type: "bool" },
  ],
} as const;
