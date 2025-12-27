import { describe, it, expect, beforeEach } from "vitest";
import { mockTauriInvoke, clearTauriMocks } from "@/test/mockTauri";
import {
  listRuns,
  getArtifacts,
  getRunDetails,
  startJob,
  killJob,
  listActiveJobs,
} from "./runService";

describe("runService", () => {
  beforeEach(() => {
    clearTauriMocks();
  });

  describe("listRuns", () => {
    it("should list runs", async () => {
      const runs = [
        { id: "run-1", dir: "/path/to/run1", modifiedMs: 123456 },
        { id: "run-2", dir: "/path/to/run2", modifiedMs: 789012 },
      ];
      mockTauriInvoke({ runs_list: runs });

      const result = await listRuns({ projectRoot: "/path/to/project" });

      expect(result).toEqual(runs);
    });
  });

  describe("getArtifacts", () => {
    it("should get artifacts for a run", async () => {
      const artifacts = [
        {
          relPath: "output.json",
          kind: "json",
          sizeBytes: 1024,
          url: "/artifacts/run-1/output.json",
        },
      ];
      mockTauriInvoke({ run_artifacts: artifacts });

      const result = await getArtifacts({
        projectRoot: "/path/to/project",
        runId: "run-1",
      });

      expect(result).toEqual(artifacts);
    });
  });

  describe("getRunDetails", () => {
    it("should get run details", async () => {
      const runDetails = {
        id: "run-abc123",
        projectRoot: "/path/to/project",
        runDir: "/path/to/project/.cyntra/runs/run-abc123",
        command: "cyntra run --once",
        label: "test-run",
        startedMs: 1700000000000,
        endedMs: 1700000060000,
        exitCode: 0,
        durationMs: 60000,
        artifactsCount: 5,
        terminalLogLines: 150,
        issuesProcessed: ["issue-1", "issue-2"],
        workcellsSpawned: 3,
        gatesPassed: 2,
        gatesFailed: 1,
      };
      mockTauriInvoke({ run_details: runDetails });

      const result = await getRunDetails({
        projectRoot: "/path/to/project",
        runId: "run-abc123",
      });

      expect(result).toEqual(runDetails);
    });

    it("should handle null optional fields", async () => {
      const runDetails = {
        id: "run-xyz",
        projectRoot: "/path/to/project",
        runDir: "/path/to/project/.cyntra/runs/run-xyz",
        command: "cyntra run --watch",
        label: null,
        startedMs: 1700000000000,
        endedMs: null,
        exitCode: null,
        durationMs: null,
        artifactsCount: 0,
        terminalLogLines: 0,
        issuesProcessed: [],
        workcellsSpawned: 0,
        gatesPassed: 0,
        gatesFailed: 0,
      };
      mockTauriInvoke({ run_details: runDetails });

      const result = await getRunDetails({
        projectRoot: "/path/to/project",
        runId: "run-xyz",
      });

      expect(result).toEqual(runDetails);
      expect(result.exitCode).toBeNull();
      expect(result.endedMs).toBeNull();
    });
  });

  describe("startJob", () => {
    it("should start a job", async () => {
      const jobInfo = {
        jobId: "job-1",
        runId: "run-1",
        runDir: "/path/to/run1",
      };
      mockTauriInvoke({ job_start: jobInfo });

      const result = await startJob({
        projectRoot: "/path/to/project",
        command: "npm test",
        label: "test-run",
      });

      expect(result).toEqual(jobInfo);
    });
  });

  describe("killJob", () => {
    it("should kill a job", async () => {
      const invokeMock = mockTauriInvoke({ job_kill: undefined });

      await killJob("job-1");

      expect(invokeMock).toHaveBeenCalledWith("job_kill", {
        params: { jobId: "job-1" },
      });
    });
  });

  describe("listActiveJobs", () => {
    it("should list active jobs", async () => {
      const activeJobs = [
        {
          jobId: "job-1",
          runId: "run-1",
          runDir: "/path/to/run1",
          command: "npm test",
          startedMs: 123456,
        },
      ];
      mockTauriInvoke({ job_list_active: activeJobs });

      const result = await listActiveJobs();

      expect(result).toEqual(activeJobs);
    });
  });
});
