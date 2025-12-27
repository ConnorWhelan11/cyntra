/**
 * Tests for BuildingConsole component
 *
 * Tests the supervised autonomy console layout, status display,
 * and control buttons during world builds.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuildingConsole } from "./BuildingConsole";
import {
  mockBuildStateGenerating,
  mockBuildStateSpeculating,
  mockBuildStateComplete,
  mockBuildStateFailed,
  mockBuildStatePaused,
} from "./fixtures";

// Mock child components
vi.mock("./components/ProcessTransparencyPanel", () => ({
  ProcessTransparencyPanel: ({ agents, isSpeculating }: any) => (
    <div
      data-testid="process-transparency"
      data-agent-count={agents.length}
      data-speculating={isSpeculating}
    >
      Process Transparency
    </div>
  ),
}));

vi.mock("./components/ProgressivePreview", () => ({
  ProgressivePreview: ({ stages, currentStage }: any) => (
    <div data-testid="progressive-preview" data-stage={currentStage} data-final={stages?.final}>
      Progressive Preview
    </div>
  ),
}));

vi.mock("./WorldPreview", () => ({
  WorldPreview: ({ mode, glbUrl, godotUrl }: any) => (
    <div data-testid="world-preview" data-mode={mode} data-glb={glbUrl} data-godot={godotUrl}>
      World Preview
    </div>
  ),
}));

vi.mock("./RefinementInput", () => ({
  RefinementInput: ({ onSubmit }: any) => (
    <div data-testid="refinement-input">
      <button onClick={() => onSubmit("test refinement")}>Submit</button>
    </div>
  ),
}));

vi.mock("./RefinementQueue", () => ({
  RefinementQueue: ({ refinements, onApplyNow: _onApplyNow }: any) => (
    <div data-testid="refinement-queue" data-count={refinements.length}>
      Refinement Queue
    </div>
  ),
}));

describe("BuildingConsole", () => {
  const defaultProps = {
    buildState: mockBuildStateGenerating,
    previewMode: "asset" as const,
    onPreviewModeChange: vi.fn(),
    onCancel: vi.fn(),
    onDismiss: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onRetry: vi.fn(),
    onViewInEvolution: vi.fn(),
    onQueueRefinement: vi.fn(),
    onApplyRefinementNow: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render with generating status", () => {
      render(<BuildingConsole {...defaultProps} />);

      expect(screen.getByText("Generating scene...")).toBeInTheDocument();
      expect(screen.getByTestId("process-transparency")).toBeInTheDocument();
      expect(screen.getByTestId("progressive-preview")).toBeInTheDocument();
    });

    it("should display truncated prompt for long prompts", () => {
      const longPromptState = {
        ...mockBuildStateGenerating,
        prompt:
          "This is a very long prompt that exceeds 80 characters and should be truncated with an ellipsis at the end for display purposes",
      };
      render(<BuildingConsole {...defaultProps} buildState={longPromptState} />);

      // The prompt is truncated to 80 chars - actual text is "wi..."
      expect(
        screen.getByText(
          /This is a very long prompt that exceeds 80 characters and should be truncated wi\.\.\./
        )
      ).toBeInTheDocument();
    });

    it("should display full prompt if under 80 chars", () => {
      const shortPrompt = { ...mockBuildStateGenerating, prompt: "Short prompt" };
      render(<BuildingConsole {...defaultProps} buildState={shortPrompt} />);

      expect(screen.getByText("Short prompt")).toBeInTheDocument();
    });

    it("should show generation and fitness stats", () => {
      render(<BuildingConsole {...defaultProps} />);

      expect(screen.getByText("Gen:")).toBeInTheDocument();
      expect(screen.getByText(String(mockBuildStateGenerating.generation))).toBeInTheDocument();
      expect(screen.getByText("Fitness:")).toBeInTheDocument();
    });

    it("should show current stage when available", () => {
      render(<BuildingConsole {...defaultProps} />);

      expect(screen.getByText("Stage:")).toBeInTheDocument();
      expect(screen.getByText("generating")).toBeInTheDocument();
    });
  });

  describe("Status Display", () => {
    it.each([
      ["queued", "Queued"],
      ["scheduling", "Scheduling..."],
      ["generating", "Generating scene..."],
      ["rendering", "Rendering preview..."],
      ["critiquing", "Running critics..."],
      ["repairing", "Repairing issues..."],
      ["exporting", "Exporting to Godot..."],
      ["voting", "Selecting best candidate..."],
      ["complete", "Complete!"],
      ["failed", "Failed"],
      ["paused", "Paused"],
    ])("should display correct text for %s status", (status, expectedText) => {
      render(
        <BuildingConsole
          {...defaultProps}
          buildState={{ ...mockBuildStateGenerating, status: status as any }}
        />
      );

      expect(screen.getByText(expectedText)).toBeInTheDocument();
    });
  });

  describe("Control Buttons - Active State", () => {
    it("should show Pause and Cancel buttons when active", () => {
      render(<BuildingConsole {...defaultProps} />);

      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Stop build" })).toBeInTheDocument();
    });

    it("should call onPause when Pause clicked", async () => {
      const user = userEvent.setup();
      render(<BuildingConsole {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "Pause" }));

      expect(defaultProps.onPause).toHaveBeenCalledTimes(1);
    });

    it("should call onCancel when Cancel clicked", async () => {
      const user = userEvent.setup();
      render(<BuildingConsole {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: "Stop build" }));

      expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("Control Buttons - Paused State", () => {
    it("should show Resume button when paused", () => {
      render(<BuildingConsole {...defaultProps} buildState={mockBuildStatePaused} />);

      expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    });

    it("should call onResume when Resume clicked", async () => {
      const user = userEvent.setup();
      render(<BuildingConsole {...defaultProps} buildState={mockBuildStatePaused} />);

      await user.click(screen.getByRole("button", { name: "Resume" }));

      expect(defaultProps.onResume).toHaveBeenCalledTimes(1);
    });
  });

  describe("Control Buttons - Complete State", () => {
    it("should show View in Evolution button when complete", () => {
      render(<BuildingConsole {...defaultProps} buildState={mockBuildStateComplete} />);

      expect(screen.getByRole("button", { name: "View in Evolution" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    });

    it("should call onViewInEvolution when View in Evolution clicked", async () => {
      const user = userEvent.setup();
      render(<BuildingConsole {...defaultProps} buildState={mockBuildStateComplete} />);

      await user.click(screen.getByRole("button", { name: "View in Evolution" }));

      expect(defaultProps.onViewInEvolution).toHaveBeenCalledTimes(1);
    });
  });

  describe("Control Buttons - Failed State", () => {
    it("should show Retry button when failed", () => {
      render(<BuildingConsole {...defaultProps} buildState={mockBuildStateFailed} />);

      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    });

    it("should call onRetry when Retry clicked", async () => {
      const user = userEvent.setup();
      render(<BuildingConsole {...defaultProps} buildState={mockBuildStateFailed} />);

      await user.click(screen.getByRole("button", { name: "Retry" }));

      expect(defaultProps.onRetry).toHaveBeenCalledTimes(1);
    });

    it("should display error message", () => {
      render(<BuildingConsole {...defaultProps} buildState={mockBuildStateFailed} />);

      expect(screen.getByText(mockBuildStateFailed.error!)).toBeInTheDocument();
    });
  });

  describe("Preview Mode Toggle", () => {
    it("should render preview mode toggle buttons", () => {
      render(<BuildingConsole {...defaultProps} />);

      expect(screen.getByRole("button", { name: "Asset" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Game" })).toBeInTheDocument();
    });

    it("should highlight active preview mode", () => {
      render(<BuildingConsole {...defaultProps} previewMode="asset" />);

      expect(screen.getByRole("button", { name: "Asset" })).toHaveClass("active");
      expect(screen.getByRole("button", { name: "Game" })).not.toHaveClass("active");
    });

    it("should call onPreviewModeChange when toggling to asset", async () => {
      const user = userEvent.setup();
      // Start in game mode with godot preview available
      render(
        <BuildingConsole {...defaultProps} buildState={mockBuildStateComplete} previewMode="game" />
      );

      await user.click(screen.getByRole("button", { name: "Asset" }));

      expect(defaultProps.onPreviewModeChange).toHaveBeenCalledWith("asset");
    });

    it("should disable Game button when Godot preview not available", () => {
      render(<BuildingConsole {...defaultProps} />);

      expect(screen.getByRole("button", { name: "Game" })).toBeDisabled();
    });

    it("should enable Game button when Godot preview available", () => {
      render(<BuildingConsole {...defaultProps} buildState={mockBuildStateComplete} />);

      expect(screen.getByRole("button", { name: "Game" })).not.toBeDisabled();
    });
  });

  describe("Child Components", () => {
    it("should pass agents to ProcessTransparencyPanel", () => {
      render(<BuildingConsole {...defaultProps} />);

      const transparencyPanel = screen.getByTestId("process-transparency");
      expect(transparencyPanel).toHaveAttribute(
        "data-agent-count",
        String(mockBuildStateGenerating.agents.length)
      );
    });

    it("should pass speculation status to ProcessTransparencyPanel", () => {
      render(<BuildingConsole {...defaultProps} buildState={mockBuildStateSpeculating} />);

      const transparencyPanel = screen.getByTestId("process-transparency");
      expect(transparencyPanel).toHaveAttribute("data-speculating", "true");
    });

    it("should pass current stage to ProgressivePreview in asset mode", () => {
      render(<BuildingConsole {...defaultProps} previewMode="asset" />);

      const preview = screen.getByTestId("progressive-preview");
      expect(preview).toHaveAttribute("data-stage", "generating");
    });

    it("should render WorldPreview in game mode", () => {
      render(
        <BuildingConsole {...defaultProps} previewMode="game" buildState={mockBuildStateComplete} />
      );

      const preview = screen.getByTestId("world-preview");
      expect(preview).toHaveAttribute("data-mode", "game");
    });

    it("should show RefinementInput when active", () => {
      render(<BuildingConsole {...defaultProps} />);

      expect(screen.getByTestId("refinement-input")).toBeInTheDocument();
    });

    it("should hide RefinementInput when complete", () => {
      render(<BuildingConsole {...defaultProps} buildState={mockBuildStateComplete} />);

      expect(screen.queryByTestId("refinement-input")).not.toBeInTheDocument();
    });

    it("should show RefinementQueue when refinements exist", () => {
      render(<BuildingConsole {...defaultProps} buildState={mockBuildStateSpeculating} />);

      expect(screen.getByTestId("refinement-queue")).toBeInTheDocument();
      expect(screen.getByTestId("refinement-queue")).toHaveAttribute(
        "data-count",
        String(mockBuildStateSpeculating.refinements.length)
      );
    });

    it("should hide RefinementQueue when no refinements", () => {
      render(<BuildingConsole {...defaultProps} />);

      expect(screen.queryByTestId("refinement-queue")).not.toBeInTheDocument();
    });
  });

  describe("Refinement Callbacks", () => {
    it("should call onQueueRefinement when refinement submitted", async () => {
      const user = userEvent.setup();
      render(<BuildingConsole {...defaultProps} />);

      // The mocked RefinementInput has a submit button that calls onSubmit with "test refinement"
      await user.click(within(screen.getByTestId("refinement-input")).getByRole("button"));

      expect(defaultProps.onQueueRefinement).toHaveBeenCalledWith("test refinement");
    });
  });

  describe("Data Attributes", () => {
    it("should set data-status attribute on container", () => {
      const { container } = render(<BuildingConsole {...defaultProps} />);

      expect(container.firstChild).toHaveAttribute("data-status", "generating");
    });
  });
});
