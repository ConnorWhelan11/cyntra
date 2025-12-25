import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ArtifactBrowser } from "./ArtifactBrowser";
import * as runService from "@/services/runService";
import type { ArtifactNode } from "@/types";

// Mock the runService
vi.mock("@/services/runService", () => ({
  getArtifactsTree: vi.fn(),
}));

// Mock the ArtifactViewer since we test it separately
vi.mock("./ArtifactViewer", () => ({
  ArtifactViewer: ({ artifact }: { artifact: ArtifactNode | null }) => (
    <div data-testid="artifact-viewer">
      {artifact ? `Viewing: ${artifact.name}` : "No selection"}
    </div>
  ),
}));

const mockTree: ArtifactNode = {
  name: "run_123",
  relPath: "",
  isDir: true,
  kind: "dir",
  sizeBytes: 0,
  url: null,
  children: [
    {
      name: "proofs",
      relPath: "proofs",
      isDir: true,
      kind: "dir",
      sizeBytes: 0,
      url: null,
      children: [
        {
          name: "proof.json",
          relPath: "proofs/proof.json",
          isDir: false,
          kind: "json",
          sizeBytes: 1234,
          url: "/artifacts/run_123/proofs/proof.json",
          children: [],
        },
      ],
    },
    {
      name: "render.png",
      relPath: "render.png",
      isDir: false,
      kind: "image",
      sizeBytes: 45678,
      url: "/artifacts/run_123/render.png",
      children: [],
    },
  ],
};

describe("ArtifactBrowser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when no runId provided", () => {
    render(
      <ArtifactBrowser
        runId={null}
        projectRoot="/test/project"
        serverBaseUrl="http://localhost:3000"
      />
    );

    expect(screen.getByText("Select a run to browse artifacts")).toBeInTheDocument();
  });

  it("shows empty state when no projectRoot provided", () => {
    render(
      <ArtifactBrowser
        runId="run_123"
        projectRoot={null}
        serverBaseUrl="http://localhost:3000"
      />
    );

    expect(screen.getByText("Select a run to browse artifacts")).toBeInTheDocument();
  });

  it("shows loading state while fetching artifacts", async () => {
    vi.mocked(runService.getArtifactsTree).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(
      <ArtifactBrowser
        runId="run_123"
        projectRoot="/test/project"
        serverBaseUrl="http://localhost:3000"
      />
    );

    expect(screen.getByText("Loading artifacts...")).toBeInTheDocument();
  });

  it("shows error state when fetch fails", async () => {
    vi.mocked(runService.getArtifactsTree).mockRejectedValueOnce(
      new Error("Network error")
    );

    render(
      <ArtifactBrowser
        runId="run_123"
        projectRoot="/test/project"
        serverBaseUrl="http://localhost:3000"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
    });
  });

  it("renders tree structure when artifacts load", async () => {
    vi.mocked(runService.getArtifactsTree).mockResolvedValueOnce(mockTree);

    render(
      <ArtifactBrowser
        runId="run_123"
        projectRoot="/test/project"
        serverBaseUrl="http://localhost:3000"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("proofs")).toBeInTheDocument();
      expect(screen.getByText("render.png")).toBeInTheDocument();
    });
  });

  it("expands directories on click", async () => {
    vi.mocked(runService.getArtifactsTree).mockResolvedValueOnce(mockTree);

    render(
      <ArtifactBrowser
        runId="run_123"
        projectRoot="/test/project"
        serverBaseUrl="http://localhost:3000"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("proofs")).toBeInTheDocument();
    });

    // Initially proof.json should not be visible
    expect(screen.queryByText("proof.json")).not.toBeInTheDocument();

    // Click to expand directory
    fireEvent.click(screen.getByText("proofs"));

    // Now proof.json should be visible
    expect(screen.getByText("proof.json")).toBeInTheDocument();
  });

  it("selects file on click and shows in viewer", async () => {
    vi.mocked(runService.getArtifactsTree).mockResolvedValueOnce(mockTree);

    render(
      <ArtifactBrowser
        runId="run_123"
        projectRoot="/test/project"
        serverBaseUrl="http://localhost:3000"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("render.png")).toBeInTheDocument();
    });

    // Click on file
    fireEvent.click(screen.getByText("render.png"));

    // Viewer should show the selected file
    await waitFor(() => {
      expect(screen.getByText("Viewing: render.png")).toBeInTheDocument();
    });
  });

  it("shows file count in header", async () => {
    vi.mocked(runService.getArtifactsTree).mockResolvedValueOnce(mockTree);

    render(
      <ArtifactBrowser
        runId="run_123"
        projectRoot="/test/project"
        serverBaseUrl="http://localhost:3000"
      />
    );

    await waitFor(() => {
      // 2 files: proof.json and render.png
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  it("shows empty message when no artifacts exist", async () => {
    const emptyTree: ArtifactNode = {
      name: "run_123",
      relPath: "",
      isDir: true,
      kind: "dir",
      sizeBytes: 0,
      url: null,
      children: [],
    };

    vi.mocked(runService.getArtifactsTree).mockResolvedValueOnce(emptyTree);

    render(
      <ArtifactBrowser
        runId="run_123"
        projectRoot="/test/project"
        serverBaseUrl="http://localhost:3000"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("No artifacts in this run")).toBeInTheDocument();
    });
  });

  it("refetches when runId changes", async () => {
    vi.mocked(runService.getArtifactsTree).mockResolvedValue(mockTree);

    const { rerender } = render(
      <ArtifactBrowser
        runId="run_123"
        projectRoot="/test/project"
        serverBaseUrl="http://localhost:3000"
      />
    );

    await waitFor(() => {
      expect(runService.getArtifactsTree).toHaveBeenCalledWith({
        projectRoot: "/test/project",
        runId: "run_123",
      });
    });

    // Change runId
    rerender(
      <ArtifactBrowser
        runId="run_456"
        projectRoot="/test/project"
        serverBaseUrl="http://localhost:3000"
      />
    );

    await waitFor(() => {
      expect(runService.getArtifactsTree).toHaveBeenCalledWith({
        projectRoot: "/test/project",
        runId: "run_456",
      });
    });
  });
});
