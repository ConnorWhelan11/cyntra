#!/usr/bin/env bun
/**
 * Register EAS Schemas for Membrane
 *
 * Run once per chain to register the RunReceipt attestation schema.
 *
 * Usage:
 *   MEMBRANE_PRIVATE_KEY=0x... bun run scripts/register-schemas.ts
 *
 * Environment:
 *   MEMBRANE_CHAIN - Chain to register on (default: base-sepolia)
 *   MEMBRANE_PRIVATE_KEY - Private key for transaction signing
 */

import { ethers } from "ethers";
import { SchemaRegistry } from "@ethereum-attestation-service/eas-sdk";
import { SUPPORTED_CHAINS, EAS_SCHEMA_STRING } from "../src/types/attestation.js";

async function main() {
  const chain = process.env.MEMBRANE_CHAIN || "base-sepolia";
  const privateKey = process.env.MEMBRANE_PRIVATE_KEY;

  if (!privateKey) {
    console.error("Error: MEMBRANE_PRIVATE_KEY environment variable not set");
    process.exit(1);
  }

  const chainConfig = SUPPORTED_CHAINS[chain];
  if (!chainConfig) {
    console.error(`Error: Unsupported chain: ${chain}`);
    console.error(`Supported: ${Object.keys(SUPPORTED_CHAINS).join(", ")}`);
    process.exit(1);
  }

  console.log(`\n🔧 Registering EAS Schema on ${chainConfig.name}\n`);
  console.log(`  Chain ID:  ${chainConfig.chainId}`);
  console.log(`  RPC:       ${chainConfig.rpcUrl}`);
  console.log(`  Registry:  ${chainConfig.schemaRegistryAddress}`);
  console.log(`  Schema:    ${EAS_SCHEMA_STRING}`);
  console.log();

  // Create provider and signer
  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  console.log(`  Signer:    ${signer.address}`);

  // Check balance
  const balance = await provider.getBalance(signer.address);
  console.log(`  Balance:   ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.error("\nError: Signer has no ETH for gas. Get testnet ETH from a faucet.");
    process.exit(1);
  }

  // Connect to schema registry
  const schemaRegistry = new SchemaRegistry(chainConfig.schemaRegistryAddress);
  schemaRegistry.connect(signer);

  console.log("\n  Registering schema...\n");

  try {
    const tx = await schemaRegistry.register({
      schema: EAS_SCHEMA_STRING,
      resolverAddress: "0x0000000000000000000000000000000000000000", // No resolver
      revocable: true,
    });

    const schemaUid = await tx.wait();

    console.log(`  ✓ Schema registered successfully!\n`);
    console.log(`  Schema UID: ${schemaUid}`);
    console.log(`  Explorer:   ${chainConfig.explorerUrl}/schema/view/${schemaUid}`);
    console.log();
    console.log("  Add this to your environment:");
    console.log();
    console.log(`  export MEMBRANE_SCHEMA_UID="${schemaUid}"`);
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message.includes("already exists")) {
      console.log("  Schema already registered. Looking up existing UID...\n");
      // Would need to query the registry to find existing UID
      console.log("  Check the EAS explorer to find your schema UID.");
    } else {
      console.error("Error registering schema:", error);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
