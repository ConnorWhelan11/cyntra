/**
 * Tests for AgentPanel component
 *
 * Tests the multi-agent accordion with fitness scores and status badges.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentPanel } from "./AgentPanel";
import {
  mockAgentRunning,
  mockAgentPassed,
  mockAgentFailed,
  mockAgentWithEvents,
} from "./fixtures";

// Mock AgentLog component
vi.mock("./AgentLog", () => ({
  AgentLog: ({ events, agentId }: any) => (
    <div data-testid={`agent-log-${agentId}`} data-event-count={events.length}>
      Agent Log
    </div>
  ),
}));

describe("AgentPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Empty State", () => {
    it("should show waiting message when no agents", () => {
      render(<AgentPanel agents={[]} isSpeculating={false} />);

      expect(screen.getByText("Waiting for agents to start...")).toBeInTheDocument();
    });
  });

  describe("Single Agent", () => {
    it("should render agent with toolchain name", () => {
      render(<AgentPanel agents={[mockAgentRunning]} isSpeculating={false} />);

      expect(screen.getByText("Claude")).toBeInTheDocument();
    });

    it("should display fitness score", () => {
      render(<AgentPanel agents={[mockAgentRunning]} isSpeculating={false} />);

      expect(screen.getByText("(0.78)")).toBeInTheDocument();
    });

    it("should expand first agent by default", () => {
      render(<AgentPanel agents={[mockAgentRunning]} isSpeculating={false} />);

      expect(screen.getByTestId(`agent-log-${mockAgentRunning.id}`)).toBeInTheDocument();
    });
  });

  describe("Multiple Agents", () => {
    const multipleAgents = [mockAgentRunning, mockAgentPassed, mockAgentFailed];

    it("should render all agents", () => {
      render(<AgentPanel agents={multipleAgents} isSpeculating={true} />);

      expect(screen.getByText("Claude")).toBeInTheDocument();
      expect(screen.getByText("Codex")).toBeInTheDocument();
      expect(screen.getByText("OpenCode")).toBeInTheDocument();
    });

    it("should show Speculate+Vote badge when speculating", () => {
      render(<AgentPanel agents={multipleAgents} isSpeculating={true} />);

      expect(screen.getByText("Speculate+Vote")).toBeInTheDocument();
    });

    it("should not show Speculate+Vote badge when not speculating", () => {
      render(<AgentPanel agents={[mockAgentRunning]} isSpeculating={false} />);

      expect(screen.queryByText("Speculate+Vote")).not.toBeInTheDocument();
    });
  });

  describe("Accordion Behavior", () => {
    it("should toggle accordion on click", async () => {
      const user = userEvent.setup();
      render(<AgentPanel agents={[mockAgentRunning, mockAgentPassed]} isSpeculating={true} />);

      // First agent expanded by default
      expect(screen.getByTestId(`agent-log-${mockAgentRunning.id}`)).toBeInTheDocument();

      // Click on second agent
      await user.click(screen.getByText("Codex"));

      // Second agent now expanded, first collapsed
      expect(screen.queryByTestId(`agent-log-${mockAgentRunning.id}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`agent-log-${mockAgentPassed.id}`)).toBeInTheDocument();
    });

    it("should collapse when clicking expanded agent", async () => {
      const user = userEvent.setup();
      render(<AgentPanel agents={[mockAgentRunning]} isSpeculating={false} />);

      // Click to collapse
      await user.click(screen.getByText("Claude"));

      expect(screen.queryByTestId(`agent-log-${mockAgentRunning.id}`)).not.toBeInTheDocument();
    });

    it("should show expand icon (+) when collapsed", async () => {
      const user = userEvent.setup();
      render(<AgentPanel agents={[mockAgentRunning]} isSpeculating={false} />);

      await user.click(screen.getByText("Claude"));

      expect(screen.getByText("+")).toBeInTheDocument();
    });

    it("should show collapse icon (−) when expanded", () => {
      render(<AgentPanel agents={[mockAgentRunning]} isSpeculating={false} />);

      expect(screen.getByText("−")).toBeInTheDocument();
    });
  });

  describe("Leading Agent Badge", () => {
    it("should show LEADING badge for leading agent", () => {
      render(
        <AgentPanel
          agents={[mockAgentRunning, mockAgentPassed]}
          leadingAgentId={mockAgentRunning.id}
          isSpeculating={true}
        />
      );

      expect(screen.getByText("LEADING")).toBeInTheDocument();
    });

    it("should not show LEADING badge when winner exists", () => {
      render(
        <AgentPanel
          agents={[mockAgentRunning, mockAgentPassed]}
          leadingAgentId={mockAgentRunning.id}
          winnerAgentId={mockAgentPassed.id}
          isSpeculating={true}
        />
      );

      // LEADING should not appear when there's a winner
      expect(screen.queryByText("LEADING")).not.toBeInTheDocument();
    });
  });

  describe("Winner Agent Badge", () => {
    it("should show WINNER badge for winning agent", () => {
      render(
        <AgentPanel
          agents={[mockAgentRunning, mockAgentPassed]}
          winnerAgentId={mockAgentPassed.id}
          isSpeculating={true}
        />
      );

      expect(screen.getByText("WINNER")).toBeInTheDocument();
    });
  });

  describe("Agent Sorting", () => {
    it("should sort winner to top", () => {
      const { container } = render(
        <AgentPanel
          agents={[mockAgentFailed, mockAgentPassed, mockAgentRunning]}
          winnerAgentId={mockAgentPassed.id}
          isSpeculating={true}
        />
      );

      const items = container.querySelectorAll(".agent-panel-item");
      expect(within(items[0] as HTMLElement).getByText("Codex")).toBeInTheDocument();
    });

    it("should sort leading to top when no winner", () => {
      const { container } = render(
        <AgentPanel
          agents={[mockAgentFailed, mockAgentPassed, mockAgentRunning]}
          leadingAgentId={mockAgentRunning.id}
          isSpeculating={true}
        />
      );

      const items = container.querySelectorAll(".agent-panel-item");
      expect(within(items[0] as HTMLElement).getByText("Claude")).toBeInTheDocument();
    });

    it("should sort by fitness when no leading/winner", () => {
      const highFitness = { ...mockAgentRunning, fitness: 0.95 };
      const lowFitness = { ...mockAgentPassed, fitness: 0.5 };

      const { container } = render(
        <AgentPanel agents={[lowFitness, highFitness]} isSpeculating={true} />
      );

      const items = container.querySelectorAll(".agent-panel-item");
      expect(within(items[0] as HTMLElement).getByText("(0.95)")).toBeInTheDocument();
    });
  });

  describe("Agent Status", () => {
    it("should display agent status in expanded view", () => {
      render(<AgentPanel agents={[mockAgentRunning]} isSpeculating={false} />);

      expect(screen.getByText("running")).toBeInTheDocument();
    });

    it("should display current stage when available", () => {
      render(<AgentPanel agents={[mockAgentRunning]} isSpeculating={false} />);

      expect(screen.getByText("generating")).toBeInTheDocument();
    });

    it("should display error for failed agent", () => {
      render(<AgentPanel agents={[mockAgentFailed]} isSpeculating={false} />);

      // Need to expand the failed agent
      expect(screen.getByText(mockAgentFailed.error!)).toBeInTheDocument();
    });
  });

  describe("AgentLog Integration", () => {
    it("should pass events to AgentLog", () => {
      render(<AgentPanel agents={[mockAgentWithEvents]} isSpeculating={false} />);

      const agentLog = screen.getByTestId(`agent-log-${mockAgentWithEvents.id}`);
      expect(agentLog).toHaveAttribute(
        "data-event-count",
        String(mockAgentWithEvents.events.length)
      );
    });
  });

  describe("Accessibility", () => {
    it("should have aria-expanded attribute on accordion buttons", () => {
      render(<AgentPanel agents={[mockAgentRunning]} isSpeculating={false} />);

      const button = screen.getByRole("button", { name: /Claude/ });
      expect(button).toHaveAttribute("aria-expanded", "true");
    });

    it("should update aria-expanded when collapsed", async () => {
      const user = userEvent.setup();
      render(<AgentPanel agents={[mockAgentRunning]} isSpeculating={false} />);

      const button = screen.getByRole("button", { name: /Claude/ });
      await user.click(button);

      expect(button).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("Toolchain Display Names", () => {
    it.each([
      ["claude", "Claude"],
      ["codex", "Codex"],
      ["opencode", "OpenCode"],
    ])("should display %s as %s", (toolchain, displayName) => {
      const agent = { ...mockAgentRunning, id: `wc-${toolchain}`, toolchain: toolchain as any };
      render(<AgentPanel agents={[agent]} isSpeculating={false} />);

      expect(screen.getByText(displayName)).toBeInTheDocument();
    });
  });
});
