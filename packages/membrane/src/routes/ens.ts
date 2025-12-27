/**
 * ENS Routes for Universe Discovery
 *
 * Provides API for resolving universe and world names via ENS.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  createEnsClient,
  resolveUniverse,
  fetchUniverseMetadata,
  resolveAddress,
  getAvatar,
  getTextRecords,
  parseUniverseName,
  computeNamehash,
  computeLabelhash,
} from "../lib/ens.js";

const app = new Hono();

/**
 * GET /ens/resolve/:name
 *
 * Resolve an ENS name to its contenthash and address
 */
app.get("/resolve/:name", async (c) => {
  const name = c.req.param("name");
  const chain = (c.req.query("chain") as "mainnet" | "sepolia") || "mainnet";

  try {
    const resolution = await resolveUniverse(name, chain);
    return c.json(resolution);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Resolution failed" },
      400
    );
  }
});

/**
 * GET /ens/universe/:name
 *
 * Fetch universe metadata from IPFS via ENS
 */
app.get("/universe/:name", async (c) => {
  const name = c.req.param("name");
  const chain = (c.req.query("chain") as "mainnet" | "sepolia") || "mainnet";
  const gateway = c.req.query("gateway") || "https://w3s.link/ipfs";

  try {
    const result = await fetchUniverseMetadata(name, chain, gateway);

    if (result.error) {
      return c.json(
        { error: result.error, resolution: result.resolution },
        404
      );
    }

    return c.json({
      resolution: result.resolution,
      metadata: result.metadata,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Fetch failed" },
      500
    );
  }
});

/**
 * GET /ens/address/:name
 *
 * Resolve ENS name to Ethereum address
 */
app.get("/address/:name", async (c) => {
  const name = c.req.param("name");
  const chain = (c.req.query("chain") as "mainnet" | "sepolia") || "mainnet";

  try {
    const client = createEnsClient(chain);
    const address = await resolveAddress(client, name);

    if (!address) {
      return c.json({ error: "Address not found" }, 404);
    }

    return c.json({ name, address });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Resolution failed" },
      400
    );
  }
});

/**
 * GET /ens/avatar/:name
 *
 * Get avatar for an ENS name
 */
app.get("/avatar/:name", async (c) => {
  const name = c.req.param("name");
  const chain = (c.req.query("chain") as "mainnet" | "sepolia") || "mainnet";

  try {
    const client = createEnsClient(chain);
    const avatar = await getAvatar(client, name);

    if (!avatar) {
      return c.json({ error: "Avatar not found" }, 404);
    }

    return c.json({ name, avatar });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Fetch failed" },
      400
    );
  }
});

/**
 * GET /ens/records/:name
 *
 * Get text records for an ENS name
 */
app.get("/records/:name", async (c) => {
  const name = c.req.param("name");
  const chain = (c.req.query("chain") as "mainnet" | "sepolia") || "mainnet";
  const keysParam = c.req.query("keys");
  const keys = keysParam
    ? keysParam.split(",")
    : ["description", "url", "com.twitter", "com.github", "contenthash"];

  try {
    const client = createEnsClient(chain);
    const records = await getTextRecords(client, name, keys);

    return c.json({ name, records });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Fetch failed" },
      400
    );
  }
});

/**
 * POST /ens/parse
 *
 * Parse a universe ENS name into components
 */
app.post(
  "/parse",
  zValidator("json", z.object({ name: z.string() })),
  (c) => {
    const { name } = c.req.valid("json");

    try {
      const parsed = parseUniverseName(name);
      return c.json(parsed);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Parse failed" },
        400
      );
    }
  }
);

/**
 * GET /ens/namehash/:name
 *
 * Compute namehash for an ENS name
 */
app.get("/namehash/:name", (c) => {
  const name = c.req.param("name");

  try {
    const hash = computeNamehash(name);
    return c.json({ name, namehash: hash });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Hash failed" },
      400
    );
  }
});

/**
 * GET /ens/labelhash/:label
 *
 * Compute labelhash for a single label
 */
app.get("/labelhash/:label", (c) => {
  const label = c.req.param("label");

  try {
    const hash = computeLabelhash(label);
    return c.json({ label, labelhash: hash });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Hash failed" },
      400
    );
  }
});

/**
 * GET /ens/discover
 *
 * Discover universes by listing known fab.eth subdomains
 * Note: This requires offchain indexing or The Graph
 */
app.get("/discover", async (c) => {
  // This would query a subgraph or database of registered universes
  // For now, return placeholder
  return c.json({
    universes: [],
    message: "Universe discovery requires The Graph subgraph integration",
  });
});

export default app;
