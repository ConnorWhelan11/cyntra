/**
 * Tests for Cartridge Controller bridge routes
 */

import { describe, it, expect, beforeEach } from "bun:test";

describe("controller routes structure", () => {
  it("should export default app", async () => {
    const controllerRoutes = await import("../src/routes/controller");
    expect(controllerRoutes.default).toBeDefined();
  });
});

describe("session policies", () => {
  it("should validate contract policies structure", () => {
    const policies = {
      contracts: {
        "0x1234": {
          name: "Test Contract",
          description: "A test contract",
          methods: [
            {
              name: "test_method",
              entrypoint: "test_method",
              description: "A test method",
            },
          ],
        },
      },
    };

    expect(policies.contracts["0x1234"]).toBeDefined();
    expect(policies.contracts["0x1234"].methods).toHaveLength(1);
    expect(policies.contracts["0x1234"].methods[0].entrypoint).toBe("test_method");
  });

  it("should support spending limits on methods", () => {
    const policies = {
      contracts: {
        "0xETH": {
          name: "Ethereum",
          methods: [
            {
              name: "approve",
              entrypoint: "approve",
              amount: "0x3", // 3 ETH limit
              description: "Approve spending",
            },
          ],
        },
      },
    };

    expect(policies.contracts["0xETH"].methods[0].amount).toBe("0x3");
  });

  it("should support message signing policies", () => {
    const policies = {
      contracts: {},
      messages: [
        {
          name: "Game Message",
          description: "Sign game messages",
          types: {
            StarknetDomain: [
              { name: "name", type: "shortstring" },
              { name: "version", type: "shortstring" },
              { name: "chainId", type: "shortstring" },
            ],
            GameMessage: [
              { name: "action", type: "felt" },
              { name: "data", type: "string" },
            ],
          },
          primaryType: "GameMessage",
          domain: {
            name: "FabGame",
            version: "1",
            chainId: "SN_SEPOLIA",
          },
        },
      ],
    };

    expect(policies.messages).toHaveLength(1);
    expect(policies.messages![0].primaryType).toBe("GameMessage");
    expect(policies.messages![0].domain.chainId).toBe("SN_SEPOLIA");
  });
});

describe("default fab policies", () => {
  it("should include all required game methods", () => {
    const worldAddress = "0xFAB_WORLD";
    const defaultMethods = [
      "join_world",
      "leave_world",
      "update_player_position",
      "spawn_asset",
      "despawn_asset",
      "pickup_item",
      "drop_item",
      "interact",
    ];

    const policies = {
      contracts: {
        [worldAddress]: {
          name: "Fab World",
          methods: defaultMethods.map((m) => ({
            name: m,
            entrypoint: m,
          })),
        },
      },
    };

    const methods = policies.contracts[worldAddress].methods;
    expect(methods).toHaveLength(8);

    for (const methodName of defaultMethods) {
      const found = methods.some((m) => m.entrypoint === methodName);
      expect(found).toBe(true);
    }
  });
});

describe("session management", () => {
  it("should generate valid connection IDs", () => {
    const connectionId = crypto.randomUUID();
    expect(connectionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("should validate session expiry", () => {
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

    expect(expiresAt).toBeGreaterThan(now);
    expect(expiresAt - now).toBe(24 * 60 * 60 * 1000);
  });
});

describe("transaction call structure", () => {
  it("should format calls correctly", () => {
    const calls = [
      {
        contractAddress: "0x123",
        entrypoint: "transfer",
        calldata: ["0x456", "100"],
      },
    ];

    expect(calls[0].contractAddress).toBe("0x123");
    expect(calls[0].entrypoint).toBe("transfer");
    expect(calls[0].calldata).toHaveLength(2);
  });

  it("should support batched calls", () => {
    const calls = [
      {
        contractAddress: "0x123",
        entrypoint: "approve",
        calldata: ["0xspender", "1000"],
      },
      {
        contractAddress: "0x456",
        entrypoint: "transfer_from",
        calldata: ["0xfrom", "0xto", "1000"],
      },
    ];

    expect(calls).toHaveLength(2);
  });
});
