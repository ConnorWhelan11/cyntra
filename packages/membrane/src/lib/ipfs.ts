/**
 * IPFS integration using w3up-client (web3.storage)
 *
 * Setup:
 * 1. Run `membrane setup` to authenticate with web3.storage
 * 2. Or set MEMBRANE_W3UP_SPACE_DID environment variable
 *
 * The w3up-client stores credentials at ~/.w3up/ by default.
 */

import { existsSync, mkdirSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";

// Re-export for type access
export type { Client } from "@web3-storage/w3up-client";

const CONFIG_DIR = join(homedir(), ".config", "membrane");
const SPACE_CONFIG_PATH = join(CONFIG_DIR, "w3up-space.json");

// Cached client instance
let clientInstance: Awaited<ReturnType<typeof import("@web3-storage/w3up-client").create>> | null = null;

/**
 * Check if w3up is configured
 * Either via environment variable or stored space config
 */
export function isConfigured(): boolean {
  // Check environment variable first
  if (process.env.MEMBRANE_W3UP_SPACE_DID) {
    return true;
  }
  // Check for stored space config
  return existsSync(SPACE_CONFIG_PATH);
}

/**
 * Get the configured space DID
 */
export async function getSpaceDid(): Promise<string | null> {
  // Check environment variable first
  if (process.env.MEMBRANE_W3UP_SPACE_DID) {
    return process.env.MEMBRANE_W3UP_SPACE_DID;
  }

  // Check stored config
  if (existsSync(SPACE_CONFIG_PATH)) {
    try {
      const config = JSON.parse(await readFile(SPACE_CONFIG_PATH, "utf-8"));
      return config.spaceDid || null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Store the space DID for future use
 */
export async function storeSpaceDid(spaceDid: string): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  await writeFile(SPACE_CONFIG_PATH, JSON.stringify({ spaceDid }, null, 2));
}

/**
 * Lazy-load w3up client
 */
async function getClient() {
  if (clientInstance) {
    return clientInstance;
  }

  // Dynamic import to handle the case where w3up isn't available
  const { create } = await import("@web3-storage/w3up-client");

  // Create client - this will use stored credentials from ~/.w3up/ if available
  const client = await create();

  // Try to set the current space
  const spaceDid = await getSpaceDid();
  if (spaceDid) {
    try {
      await client.setCurrentSpace(spaceDid as `did:key:${string}`);
    } catch (e) {
      // Space might not be authorized yet
      console.warn(`Warning: Could not set space ${spaceDid}: ${e}`);
    }
  }

  clientInstance = client;
  return client;
}

/**
 * Setup w3up authentication
 * Returns the email that was sent a verification link
 */
export async function setupAuthentication(email: string): Promise<void> {
  const { create } = await import("@web3-storage/w3up-client");
  const client = await create();

  console.log(`Sending verification email to ${email}...`);
  await client.login(email as `${string}@${string}`);
  console.log("Email sent! Check your inbox and click the verification link.");
  console.log("After verifying, run 'membrane setup' again to complete setup.");
}

/**
 * List available spaces for the authenticated user
 */
export async function listSpaces(): Promise<Array<{ did: string; name?: string }>> {
  const client = await getClient();
  const spaces = client.spaces();

  return spaces.map(space => ({
    did: space.did(),
    name: space.name,
  }));
}

/**
 * Create a new space
 */
export async function createSpace(name: string): Promise<string> {
  const client = await getClient();
  const space = await client.createSpace(name);
  await client.setCurrentSpace(space.did());
  await storeSpaceDid(space.did());
  return space.did();
}

/**
 * Select an existing space by DID
 */
export async function selectSpace(spaceDid: string): Promise<void> {
  const client = await getClient();
  await client.setCurrentSpace(spaceDid as `did:key:${string}`);
  await storeSpaceDid(spaceDid);
}

/**
 * Check if the client is logged in
 */
export async function isLoggedIn(): Promise<boolean> {
  try {
    const client = await getClient();
    const spaces = client.spaces();
    return spaces.length > 0;
  } catch {
    return false;
  }
}

/**
 * Upload a single file to IPFS
 *
 * @param filePath - Absolute path to file
 * @returns CID of uploaded file
 */
export async function uploadFile(filePath: string): Promise<string> {
  const client = await getClient();

  const content = await readFile(filePath);
  const fileName = basename(filePath);

  const file = new File([content], fileName);
  const cid = await client.uploadFile(file);

  return cid.toString();
}

/**
 * Upload a directory to IPFS
 *
 * @param dirPath - Absolute path to directory
 * @returns CID of uploaded directory
 */
export async function uploadDirectory(dirPath: string): Promise<string> {
  const client = await getClient();

  const files: File[] = [];
  await collectFiles(dirPath, dirPath, files);

  if (files.length === 0) {
    throw new Error(`No files found in directory: ${dirPath}`);
  }

  const cid = await client.uploadDirectory(files);
  return cid.toString();
}

/**
 * Recursively collect files from a directory
 */
async function collectFiles(basePath: string, currentPath: string, files: File[]): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(currentPath, entry.name);

    if (entry.isDirectory()) {
      // Skip hidden directories and node_modules
      if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
        await collectFiles(basePath, fullPath, files);
      }
    } else if (entry.isFile()) {
      // Skip hidden files
      if (!entry.name.startsWith(".")) {
        const content = await readFile(fullPath);
        const relativePath = fullPath.slice(basePath.length + 1);
        files.push(new File([content], relativePath));
      }
    }
  }
}

/**
 * Compute the CID of a file without uploading
 *
 * Note: This requires computing the UnixFS DAG locally
 * For now, we'll just read the file and return a placeholder
 * Full implementation would use @ipld/car
 */
export async function computeCid(_filePath: string): Promise<string> {
  // For now, throw as this is complex to implement without uploading
  throw new Error(
    "computeCid not yet implemented. Use uploadFile to get the CID after uploading."
  );
}

/**
 * Check if a CID is available on IPFS
 */
export async function checkAvailability(cid: string): Promise<boolean> {
  try {
    const response = await fetch(`https://w3s.link/ipfs/${cid}`, {
      method: "HEAD",
    });
    return response.ok;
  } catch {
    return false;
  }
}
