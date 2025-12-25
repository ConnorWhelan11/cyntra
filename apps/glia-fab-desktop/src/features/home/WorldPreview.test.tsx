/**
 * Tests for WorldPreview component
 *
 * Tests the dual-mode preview viewport (Three.js + Godot Web iframe).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorldPreview } from "./WorldPreview";

// Mock react-three-fiber and drei - use inline functions to avoid hoisting issues
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children, className }: any) => (
    <div data-testid="three-canvas" className={className}>
      {children}
    </div>
  ),
}));

vi.mock("@react-three/drei", () => {
  // Create useGLTF with clear method
  const useGLTF = Object.assign(
    () => ({ scene: { clone: () => ({}) } }),
    { clear: vi.fn() }
  );

  return {
    OrbitControls: () => null,
    Environment: () => null,
    useGLTF,
    Center: ({ children }: any) => <div data-testid="center">{children}</div>,
    Html: ({ children }: any) => <div data-testid="html">{children}</div>,
  };
});

// Need to also mock primitive since it's from three/fiber
vi.mock("three", () => ({
  default: {},
}));

describe("WorldPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Asset Mode", () => {
    it("should show empty message when no GLB URL", () => {
      render(<WorldPreview mode="asset" />);

      expect(screen.getByText("Waiting for asset...")).toBeInTheDocument();
    });

    it("should have asset mode data attribute", () => {
      const { container } = render(<WorldPreview mode="asset" />);

      expect(container.firstChild).toHaveAttribute("data-mode", "asset");
    });

    it("should render Canvas when glbUrl provided", () => {
      render(<WorldPreview mode="asset" glbUrl="/path/to/model.glb" />);

      // Canvas is rendered (mocked)
      expect(screen.getByTestId("three-canvas")).toBeInTheDocument();
    });

    it("should have correct data-mode attribute", () => {
      const { container } = render(<WorldPreview mode="asset" />);

      expect(container.firstChild).toHaveAttribute("data-mode", "asset");
    });
  });

  describe("Game Mode (Godot)", () => {
    it("should show empty message when no Godot URL", () => {
      render(<WorldPreview mode="game" />);

      expect(screen.getByText("Godot export not yet available")).toBeInTheDocument();
    });

    it("should render iframe when Godot URL provided", () => {
      render(<WorldPreview mode="game" godotUrl="/godot/index.html" />);

      const iframe = screen.getByTitle("Godot Web Preview");
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute("src", "/godot/index.html");
    });

    it("should have correct sandbox attributes on iframe", () => {
      render(<WorldPreview mode="game" godotUrl="/godot/index.html" />);

      const iframe = screen.getByTitle("Godot Web Preview");
      expect(iframe).toHaveAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-popups"
      );
    });

    it("should have correct data-mode attribute", () => {
      const { container } = render(<WorldPreview mode="game" godotUrl="/godot/index.html" />);

      expect(container.firstChild).toHaveAttribute("data-mode", "game");
    });

    it("should show loading state initially for iframe", () => {
      render(<WorldPreview mode="game" godotUrl="/godot/index.html" />);

      // Loading state should be visible initially
      expect(screen.getByText("Loading preview...")).toBeInTheDocument();
    });

    it("should hide loading state after iframe loads", () => {
      render(<WorldPreview mode="game" godotUrl="/godot/index.html" />);

      const iframe = screen.getByTitle("Godot Web Preview");
      fireEvent.load(iframe);

      expect(screen.queryByText("Loading preview...")).not.toBeInTheDocument();
    });
  });

  describe("Mode Switching", () => {
    it("should switch from asset empty to game mode", () => {
      const { rerender } = render(<WorldPreview mode="asset" />);

      expect(screen.getByText("Waiting for asset...")).toBeInTheDocument();

      rerender(<WorldPreview mode="game" godotUrl="/godot/index.html" />);

      expect(screen.getByTitle("Godot Web Preview")).toBeInTheDocument();
    });

    it("should switch from game to asset empty mode", () => {
      const { rerender } = render(<WorldPreview mode="game" godotUrl="/godot/index.html" />);

      expect(screen.getByTitle("Godot Web Preview")).toBeInTheDocument();

      rerender(<WorldPreview mode="asset" />);

      expect(screen.getByText("Waiting for asset...")).toBeInTheDocument();
    });
  });

  describe("Empty States", () => {
    it("should show waiting icon in asset empty state", () => {
      render(<WorldPreview mode="asset" />);

      expect(screen.getByText("◌")).toBeInTheDocument();
    });

    it("should show waiting icon in game empty state", () => {
      render(<WorldPreview mode="game" />);

      expect(screen.getByText("◌")).toBeInTheDocument();
    });
  });

  describe("Loading States", () => {
    it("should render loading fallback with spinner", () => {
      render(<WorldPreview mode="game" godotUrl="/godot/index.html" />);

      // The loading spinner should be visible
      const loadingSpinner = document.querySelector(".world-preview-loading-spinner");
      expect(loadingSpinner).toBeInTheDocument();
    });
  });

  describe("CSS Classes", () => {
    it("should have world-preview base class", () => {
      const { container } = render(<WorldPreview mode="asset" />);

      expect(container.firstChild).toHaveClass("world-preview");
    });

    it("should apply world-preview-canvas class to Canvas when glbUrl provided", () => {
      render(<WorldPreview mode="asset" glbUrl="/model.glb" />);

      expect(screen.getByTestId("three-canvas")).toHaveClass("world-preview-canvas");
    });
  });
});
