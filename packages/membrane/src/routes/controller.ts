/**
 * Cartridge Controller Bridge Routes
 *
 * Provides a bridge between native applications (Godot) and the Cartridge
 * Controller SDK. Since Controller SDK is JavaScript/TypeScript-based,
 * this service exposes HTTP endpoints that native apps can use.
 *
 * Flow:
 * 1. Native app calls POST /controller/connect with session policies
 * 2. Service generates keychain URL with policies
 * 3. User authenticates via keychain (passkey, social, etc.)
 * 4. Keychain redirects back with session credentials
 * 5. Native app can now execute transactions via POST /controller/execute
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  saveSession,
  getSession,
  deleteSession,
  savePendingConnection,
  getPendingConnection,
  deletePendingConnection,
  deleteOldPendingConnections,
} from "../lib/database.js";
import {
  createTransaction,
  getTransaction,
  getSessionTransactions,
  simulateTransactionExecution,
  type TransactionCall,
} from "../lib/transactions.js";

const app = new Hono();

/**
 * Session Policy Types (matches @cartridge/controller)
 */
interface ContractMethod {
  name: string;
  entrypoint: string;
  description?: string;
  amount?: string; // Spending limit in hex
}

interface ContractPolicy {
  name?: string;
  description?: string;
  methods: ContractMethod[];
}

interface SessionPolicies {
  contracts: Record<string, ContractPolicy>;
  messages?: Array<{
    name?: string;
    description?: string;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    domain: {
      name: string;
      version: string;
      chainId: string;
      revision?: string;
    };
  }>;
}

// Schema definitions
const SessionPoliciesSchema = z.object({
  contracts: z.record(
    z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      methods: z.array(
        z.object({
          name: z.string(),
          entrypoint: z.string(),
          description: z.string().optional(),
          amount: z.string().optional(),
        })
      ),
    })
  ),
  messages: z
    .array(
      z.object({
        name: z.string().optional(),
        description: z.string().optional(),
        types: z.record(z.array(z.object({ name: z.string(), type: z.string() }))),
        primaryType: z.string(),
        domain: z.object({
          name: z.string(),
          version: z.string(),
          chainId: z.string(),
          revision: z.string().optional(),
        }),
      })
    )
    .optional(),
});

const ConnectRequestSchema = z.object({
  policies: SessionPoliciesSchema,
  chainId: z.string().default("SN_SEPOLIA"),
  redirectUrl: z.string().url(),
  preset: z.string().optional(), // Theme preset
});

const ExecuteRequestSchema = z.object({
  sessionId: z.string(),
  calls: z.array(
    z.object({
      contractAddress: z.string(),
      entrypoint: z.string(),
      calldata: z.array(z.string()),
    })
  ),
});

const CallbackSchema = z.object({
  connectionId: z.string(),
  address: z.string(),
  sessionToken: z.string().optional(),
  error: z.string().optional(),
});

/**
 * Configuration
 */
const KEYCHAIN_URL = "https://x.cartridge.gg";
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * POST /controller/connect
 *
 * Initiate a connection to Cartridge Controller.
 * Returns a URL to redirect the user to for authentication.
 */
app.post("/connect", zValidator("json", ConnectRequestSchema), async (c) => {
  const { policies, chainId, redirectUrl, preset } = c.req.valid("json");

  // Generate connection ID
  const connectionId = crypto.randomUUID();

  // Store pending connection
  savePendingConnection({
    id: connectionId,
    policies: JSON.stringify(policies),
    redirectUrl,
    createdAt: Date.now(),
  });

  // Clean up old pending connections (older than 10 minutes)
  deleteOldPendingConnections();

  // Build keychain URL with policies
  const callbackUrl = new URL("/controller/callback", c.req.url).toString();
  const encodedPolicies = encodeURIComponent(JSON.stringify(policies));

  const keychainUrl = new URL("/session/create", KEYCHAIN_URL);
  keychainUrl.searchParams.set("callback", callbackUrl);
  keychainUrl.searchParams.set("connection_id", connectionId);
  keychainUrl.searchParams.set("policies", encodedPolicies);
  keychainUrl.searchParams.set("chain_id", chainId);
  if (preset) {
    keychainUrl.searchParams.set("preset", preset);
  }

  return c.json({
    connectionId,
    keychainUrl: keychainUrl.toString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
});

/**
 * GET /controller/callback
 *
 * Callback endpoint for keychain redirect.
 * Stores the session and redirects to the app's redirect URL.
 */
app.get("/callback", async (c) => {
  const connectionId = c.req.query("connection_id");
  const address = c.req.query("address");
  // Note: session_token from keychain reserved for future Paymaster integration
  const error = c.req.query("error");

  if (!connectionId) {
    return c.json({ error: "Missing connection_id" }, 400);
  }

  const pending = getPendingConnection(connectionId);
  if (!pending) {
    return c.json({ error: "Connection expired or not found" }, 404);
  }

  deletePendingConnection(connectionId);

  if (error) {
    // Redirect with error
    const redirectUrl = new URL(pending.redirectUrl);
    redirectUrl.searchParams.set("error", error);
    return c.redirect(redirectUrl.toString());
  }

  if (!address) {
    const redirectUrl = new URL(pending.redirectUrl);
    redirectUrl.searchParams.set("error", "Missing address");
    return c.redirect(redirectUrl.toString());
  }

  // Create session
  const sessionId = crypto.randomUUID();
  saveSession({
    id: sessionId,
    address,
    chainId: "SN_SEPOLIA", // Would come from keychain
    policies: pending.policies, // Already JSON stringified
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION,
  });

  // Redirect to app with session
  const redirectUrl = new URL(pending.redirectUrl);
  redirectUrl.searchParams.set("session_id", sessionId);
  redirectUrl.searchParams.set("address", address);

  return c.redirect(redirectUrl.toString());
});

/**
 * POST /controller/callback
 *
 * Alternative callback for apps that prefer POST.
 */
app.post("/callback", zValidator("json", CallbackSchema), async (c) => {
  const { connectionId, address, error } = c.req.valid("json");

  const pending = getPendingConnection(connectionId);
  if (!pending) {
    return c.json({ error: "Connection expired or not found" }, 404);
  }

  deletePendingConnection(connectionId);

  if (error) {
    return c.json({ error }, 400);
  }

  // Create session
  const sessionId = crypto.randomUUID();
  saveSession({
    id: sessionId,
    address,
    chainId: "SN_SEPOLIA",
    policies: pending.policies, // Already JSON stringified
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION,
  });

  return c.json({
    sessionId,
    address,
    expiresAt: new Date(Date.now() + SESSION_DURATION).toISOString(),
  });
});

/**
 * GET /controller/session/:sessionId
 *
 * Get session status and details.
 */
app.get("/session/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  const session = getSession(sessionId);

  if (!session) {
    return c.json({ valid: false, error: "Session not found" }, 404);
  }

  if (Date.now() > session.expiresAt) {
    deleteSession(sessionId);
    return c.json({ valid: false, error: "Session expired" }, 401);
  }

  return c.json({
    valid: true,
    address: session.address,
    chainId: session.chainId,
    expiresAt: new Date(session.expiresAt).toISOString(),
    policies: JSON.parse(session.policies),
  });
});

/**
 * POST /controller/execute
 *
 * Execute a transaction using an active session.
 * Validates that the call matches approved policies.
 */
app.post("/execute", zValidator("json", ExecuteRequestSchema), async (c) => {
  const { sessionId, calls } = c.req.valid("json");

  const session = getSession(sessionId);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  if (Date.now() > session.expiresAt) {
    deleteSession(sessionId);
    return c.json({ error: "Session expired" }, 401);
  }

  // Parse policies from JSON
  const policies = JSON.parse(session.policies) as SessionPolicies;

  // Validate calls against policies
  for (const call of calls) {
    const contractPolicy = policies.contracts[call.contractAddress];
    if (!contractPolicy) {
      return c.json(
        {
          error: `Contract ${call.contractAddress} not in approved policies`,
        },
        403
      );
    }

    const methodAllowed = contractPolicy.methods.some(
      (m) => m.entrypoint === call.entrypoint
    );
    if (!methodAllowed) {
      return c.json(
        {
          error: `Method ${call.entrypoint} not approved for ${call.contractAddress}`,
        },
        403
      );
    }
  }

  // Create transaction record
  const txCalls: TransactionCall[] = calls.map((call) => ({
    contractAddress: call.contractAddress,
    entrypoint: call.entrypoint,
    calldata: call.calldata,
  }));
  const tx = createTransaction(sessionId, txCalls);

  // Simulate transaction execution (in production: use Cartridge Controller SDK)
  const result = await simulateTransactionExecution(tx);

  return c.json({
    transactionId: tx.id,
    transactionHash: result.transactionHash,
    status: result.status,
    calls: calls.length,
  });
});

/**
 * GET /controller/transaction/:transactionId
 *
 * Get transaction status and details.
 */
app.get("/transaction/:transactionId", (c) => {
  const transactionId = c.req.param("transactionId");
  const tx = getTransaction(transactionId);

  if (!tx) {
    return c.json({ error: "Transaction not found" }, 404);
  }

  return c.json({
    id: tx.id,
    sessionId: tx.sessionId,
    transactionHash: tx.transactionHash,
    status: tx.status,
    calls: tx.calls,
    createdAt: new Date(tx.createdAt).toISOString(),
    updatedAt: new Date(tx.updatedAt).toISOString(),
    error: tx.error,
  });
});

/**
 * GET /controller/session/:sessionId/transactions
 *
 * Get transaction history for a session.
 */
app.get("/session/:sessionId/transactions", (c) => {
  const sessionId = c.req.param("sessionId");
  const limit = parseInt(c.req.query("limit") || "50", 10);

  const session = getSession(sessionId);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const transactions = getSessionTransactions(sessionId, limit);

  return c.json({
    sessionId,
    transactions: transactions.map((tx) => ({
      id: tx.id,
      transactionHash: tx.transactionHash,
      status: tx.status,
      callCount: tx.calls.length,
      createdAt: new Date(tx.createdAt).toISOString(),
      error: tx.error,
    })),
    count: transactions.length,
  });
});

/**
 * POST /controller/disconnect
 *
 * Disconnect and invalidate a session.
 */
app.post(
  "/disconnect",
  zValidator("json", z.object({ sessionId: z.string() })),
  async (c) => {
    const { sessionId } = c.req.valid("json");

    const session = getSession(sessionId);
    if (session) {
      deleteSession(sessionId);
      return c.json({ disconnected: true });
    }

    return c.json({ disconnected: false, error: "Session not found" }, 404);
  }
);

/**
 * GET /controller/status
 *
 * Check connection status for a pending connection.
 */
app.get("/status/:connectionId", (c) => {
  const connectionId = c.req.param("connectionId");

  // In production, we'd track connection → session mapping
  // For now, just check if connection is still pending
  // TODO: Add connection_id → session_id tracking

  const pending = getPendingConnection(connectionId);
  if (pending) {
    return c.json({
      status: "pending",
      createdAt: new Date(pending.createdAt).toISOString(),
    });
  }

  return c.json({ status: "unknown" });
});

/**
 * GET /controller/policies/default
 *
 * Get default session policies for Fab games.
 */
app.get("/policies/default", (c) => {
  const worldAddress = c.req.query("world") || "0x0";

  const defaultPolicies: SessionPolicies = {
    contracts: {
      [worldAddress]: {
        name: "Fab World",
        description: "Fab game world interactions",
        methods: [
          {
            name: "Join World",
            entrypoint: "join_world",
            description: "Join the game world",
          },
          {
            name: "Leave World",
            entrypoint: "leave_world",
            description: "Leave the game world",
          },
          {
            name: "Update Position",
            entrypoint: "update_player_position",
            description: "Update player position",
          },
          {
            name: "Spawn Asset",
            entrypoint: "spawn_asset",
            description: "Spawn an asset in the world",
          },
          {
            name: "Despawn Asset",
            entrypoint: "despawn_asset",
            description: "Remove an asset from the world",
          },
          {
            name: "Pickup Item",
            entrypoint: "pickup_item",
            description: "Pick up an item",
          },
          {
            name: "Drop Item",
            entrypoint: "drop_item",
            description: "Drop an item",
          },
          {
            name: "Interact",
            entrypoint: "interact",
            description: "Interact with an object",
          },
        ],
      },
    },
  };

  return c.json(defaultPolicies);
});

export default app;
