/**
 * Tests for Membrane Service
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import {
  startMembrane,
  stopMembrane,
  getMembraneStatus,
  ensureMembraneRunning,
} from "./membraneService";

describe("membraneService IPC calls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call membrane_start command", async () => {
    const mockStatus = {
      running: true,
      port: 7331,
      version: "0.1.0",
      uptime: 100,
      pid: 12345,
    };
    vi.mocked(invoke).mockResolvedValueOnce(mockStatus);

    const result = await startMembrane();

    expect(invoke).toHaveBeenCalledWith("membrane_start");
    expect(result).toEqual(mockStatus);
  });

  it("should call membrane_stop command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await stopMembrane();

    expect(invoke).toHaveBeenCalledWith("membrane_stop");
  });

  it("should call membrane_status command", async () => {
    const mockStatus = {
      running: false,
      port: 7331,
    };
    vi.mocked(invoke).mockResolvedValueOnce(mockStatus);

    const result = await getMembraneStatus();

    expect(invoke).toHaveBeenCalledWith("membrane_status");
    expect(result.running).toBe(false);
  });

  it("should call membrane_ensure command", async () => {
    const mockStatus = {
      running: true,
      port: 7331,
      version: "0.1.0",
      uptime: 5,
    };
    vi.mocked(invoke).mockResolvedValueOnce(mockStatus);

    const result = await ensureMembraneRunning();

    expect(invoke).toHaveBeenCalledWith("membrane_ensure");
    expect(result.running).toBe(true);
  });
});

describe("membraneService HTTP functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  it("should handle controller connect errors", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Connection failed" }),
    } as Response);

    const { connectController } = await import("./membraneService");

    await expect(
      connectController({
        policies: { contracts: {} },
        redirectUrl: "http://localhost:8765/callback",
      })
    ).rejects.toThrow("Connection failed");
  });
});
