import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ArtifactViewer } from "./ArtifactViewer";
import type { ArtifactNode } from "@/types";

// Mock fetch - keep reference to mock for test methods, cast for global assignment
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("ArtifactViewer", () => {
  const serverBaseUrl = "http://localhost:3000";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when no artifact selected", () => {
    render(<ArtifactViewer artifact={null} serverBaseUrl={serverBaseUrl} />);

    expect(screen.getByText("Select a file to preview")).toBeInTheDocument();
  });

  it("shows directory info when directory selected", () => {
    const dirArtifact: ArtifactNode = {
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
          sizeBytes: 100,
          url: "/artifacts/proof.json",
          children: [],
        },
        {
          name: "meta.json",
          relPath: "proofs/meta.json",
          isDir: false,
          kind: "json",
          sizeBytes: 50,
          url: "/artifacts/meta.json",
          children: [],
        },
      ],
    };

    render(<ArtifactViewer artifact={dirArtifact} serverBaseUrl={serverBaseUrl} />);

    expect(screen.getByText("proofs")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
  });

  it("renders image viewer for image artifacts", () => {
    const imageArtifact: ArtifactNode = {
      name: "render.png",
      relPath: "render.png",
      isDir: false,
      kind: "image",
      sizeBytes: 45678,
      url: "/artifacts/render.png",
      children: [],
    };

    render(<ArtifactViewer artifact={imageArtifact} serverBaseUrl={serverBaseUrl} />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "http://localhost:3000/artifacts/render.png");
  });

  it("fetches and renders JSON content", async () => {
    const jsonContent = { status: "pass", score: 0.95 };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(jsonContent)),
    });

    const jsonArtifact: ArtifactNode = {
      name: "proof.json",
      relPath: "proof.json",
      isDir: false,
      kind: "json",
      sizeBytes: 100,
      url: "/artifacts/proof.json",
      children: [],
    };

    render(<ArtifactViewer artifact={jsonArtifact} serverBaseUrl={serverBaseUrl} />);

    await waitFor(() => {
      expect(screen.getByText(/"status": "pass"/)).toBeInTheDocument();
      expect(screen.getByText(/"score": 0.95/)).toBeInTheDocument();
    });
  });

  it("fetches and renders text content", async () => {
    const textContent = "Hello, World!";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(textContent),
    });

    const textArtifact: ArtifactNode = {
      name: "log.txt",
      relPath: "log.txt",
      isDir: false,
      kind: "text",
      sizeBytes: 13,
      url: "/artifacts/log.txt",
      children: [],
    };

    render(<ArtifactViewer artifact={textArtifact} serverBaseUrl={serverBaseUrl} />);

    await waitFor(() => {
      expect(screen.getByText("Hello, World!")).toBeInTheDocument();
    });
  });

  it("renders HTML iframe for html artifacts", () => {
    const htmlArtifact: ArtifactNode = {
      name: "report.html",
      relPath: "report.html",
      isDir: false,
      kind: "html",
      sizeBytes: 5000,
      url: "/artifacts/report.html",
      children: [],
    };

    render(<ArtifactViewer artifact={htmlArtifact} serverBaseUrl={serverBaseUrl} />);

    const iframe = screen.getByTitle("HTML Preview");
    expect(iframe).toHaveAttribute("src", "http://localhost:3000/artifacts/report.html");
  });

  it("renders GLB placeholder with download link", () => {
    const glbArtifact: ArtifactNode = {
      name: "model.glb",
      relPath: "model.glb",
      isDir: false,
      kind: "glb",
      sizeBytes: 500000,
      url: "/artifacts/model.glb",
      children: [],
    };

    render(<ArtifactViewer artifact={glbArtifact} serverBaseUrl={serverBaseUrl} />);

    expect(screen.getByText("3D Model")).toBeInTheDocument();
    const link = screen.getByText("Download GLB");
    expect(link).toHaveAttribute("href", "http://localhost:3000/artifacts/model.glb");
  });

  it("renders download link for unknown file types", () => {
    const unknownArtifact: ArtifactNode = {
      name: "data.bin",
      relPath: "data.bin",
      isDir: false,
      kind: "other",
      sizeBytes: 1024,
      url: "/artifacts/data.bin",
      children: [],
    };

    render(<ArtifactViewer artifact={unknownArtifact} serverBaseUrl={serverBaseUrl} />);

    expect(screen.getByText("data.bin")).toBeInTheDocument();
    expect(screen.getByText("1 KB")).toBeInTheDocument();
    const link = screen.getByText("Download File");
    expect(link).toHaveAttribute("href", "http://localhost:3000/artifacts/data.bin");
  });

  it("shows error when fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const jsonArtifact: ArtifactNode = {
      name: "missing.json",
      relPath: "missing.json",
      isDir: false,
      kind: "json",
      sizeBytes: 100,
      url: "/artifacts/missing.json",
      children: [],
    };

    render(<ArtifactViewer artifact={jsonArtifact} serverBaseUrl={serverBaseUrl} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
    });
  });

  it("handles JSON parse errors gracefully", async () => {
    const invalidJson = "not valid json";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(invalidJson),
    });

    const jsonArtifact: ArtifactNode = {
      name: "invalid.json",
      relPath: "invalid.json",
      isDir: false,
      kind: "json",
      sizeBytes: 16,
      url: "/artifacts/invalid.json",
      children: [],
    };

    render(<ArtifactViewer artifact={jsonArtifact} serverBaseUrl={serverBaseUrl} />);

    // Should fall back to plain text display
    await waitFor(() => {
      expect(screen.getByText("not valid json")).toBeInTheDocument();
    });
  });

  it("shows loading state while fetching content", () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    const jsonArtifact: ArtifactNode = {
      name: "slow.json",
      relPath: "slow.json",
      isDir: false,
      kind: "json",
      sizeBytes: 100,
      url: "/artifacts/slow.json",
      children: [],
    };

    render(<ArtifactViewer artifact={jsonArtifact} serverBaseUrl={serverBaseUrl} />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
