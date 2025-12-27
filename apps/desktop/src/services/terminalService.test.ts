import { describe, it, expect, beforeEach } from "vitest";
import { mockTauriInvoke, clearTauriMocks } from "@/test/mockTauri";
import { createPty, listPty, writePty, resizePty, killPty } from "./terminalService";

describe("terminalService", () => {
  beforeEach(() => {
    clearTauriMocks();
  });

  describe("createPty", () => {
    it("should create a PTY session", async () => {
      const sessionId = "session-123";
      mockTauriInvoke({ pty_create: sessionId });

      const result = await createPty({
        cwd: "/path/to/cwd",
        cols: 80,
        rows: 24,
      });

      expect(result).toBe(sessionId);
    });
  });

  describe("listPty", () => {
    it("should list PTY sessions", async () => {
      const sessions = [
        { id: "session-1", cwd: "/path1", command: "bash" },
        { id: "session-2", cwd: "/path2", command: "zsh" },
      ];
      mockTauriInvoke({ pty_list: sessions });

      const result = await listPty();

      expect(result).toEqual(sessions);
    });
  });

  describe("writePty", () => {
    it("should write data to PTY", async () => {
      const invokeMock = mockTauriInvoke({ pty_write: undefined });

      await writePty({ sessionId: "session-1", data: "echo hello\n" });

      expect(invokeMock).toHaveBeenCalledWith("pty_write", {
        params: { sessionId: "session-1", data: "echo hello\n" },
      });
    });
  });

  describe("resizePty", () => {
    it("should resize PTY", async () => {
      const invokeMock = mockTauriInvoke({ pty_resize: undefined });

      await resizePty({ sessionId: "session-1", cols: 100, rows: 30 });

      expect(invokeMock).toHaveBeenCalledWith("pty_resize", {
        params: { sessionId: "session-1", cols: 100, rows: 30 },
      });
    });
  });

  describe("killPty", () => {
    it("should kill PTY session", async () => {
      const invokeMock = mockTauriInvoke({ pty_kill: undefined });

      await killPty("session-1");

      expect(invokeMock).toHaveBeenCalledWith("pty_kill", {
        params: { sessionId: "session-1" },
      });
    });
  });
});
