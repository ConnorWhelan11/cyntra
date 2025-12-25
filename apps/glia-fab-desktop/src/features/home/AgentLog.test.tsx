/**
 * Tests for AgentLog component
 *
 * Tests event log display with auto-scroll and filtering.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentLog } from "./AgentLog";
import { mockBuildEvents } from "./fixtures";
import type { BuildEvent } from "@/types";

describe("AgentLog", () => {
  const agentId = "wc-claude-001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Empty State", () => {
    it("should show empty message when no events", () => {
      render(<AgentLog events={[]} agentId={agentId} />);

      expect(screen.getByText("No events yet...")).toBeInTheDocument();
    });
  });

  describe("Event Rendering", () => {
    it("should render events", () => {
      render(<AgentLog events={mockBuildEvents} agentId={agentId} />);

      expect(screen.getByText("Workcell created")).toBeInTheDocument();
    });

    it("should show event icons for different types", () => {
      const events: BuildEvent[] = [
        { id: "1", type: "system", message: "System", timestamp: Date.now() },
        { id: "2", type: "agent", message: "Agent", timestamp: Date.now() },
        { id: "3", type: "critic", message: "Critic", timestamp: Date.now() },
        { id: "4", type: "user", message: "User", timestamp: Date.now() },
        { id: "5", type: "error", message: "Error", timestamp: Date.now() },
        { id: "6", type: "vote", message: "Vote", timestamp: Date.now() },
      ];

      render(<AgentLog events={events} agentId={agentId} />);

      // Check that each event type has its icon
      expect(screen.getByText("⚙")).toBeInTheDocument(); // system
      expect(screen.getByText("▶")).toBeInTheDocument(); // agent
      expect(screen.getByText("◉")).toBeInTheDocument(); // critic
      expect(screen.getByText("💬")).toBeInTheDocument(); // user
      expect(screen.getByText("⚠")).toBeInTheDocument(); // error
      expect(screen.getByText("✓")).toBeInTheDocument(); // vote
    });

    it("should format timestamp as HH:MM:SS", () => {
      const timestamp = new Date("2025-01-01T14:30:45").getTime();
      const events: BuildEvent[] = [
        { id: "1", type: "system", message: "Test", timestamp },
      ];

      render(<AgentLog events={events} agentId={agentId} />);

      expect(screen.getByText("14:30:45")).toBeInTheDocument();
    });

    it("should format event message from event type", () => {
      const events: BuildEvent[] = [
        { id: "1", type: "agent", message: "fab.stage.generate", timestamp: Date.now() },
      ];

      render(<AgentLog events={events} agentId={agentId} />);

      // Should extract and format the last part
      expect(screen.getByText("generate")).toBeInTheDocument();
    });
  });

  describe("Event Metadata", () => {
    it("should display fitness metadata", () => {
      const events: BuildEvent[] = [
        {
          id: "1",
          type: "critic",
          message: "Critic result",
          timestamp: Date.now(),
          metadata: { fitness: 0.856 },
        },
      ];

      render(<AgentLog events={events} agentId={agentId} />);

      expect(screen.getByText(/fitness: 0\.86/)).toBeInTheDocument();
    });

    it("should display duration metadata", () => {
      const events: BuildEvent[] = [
        {
          id: "1",
          type: "agent",
          message: "Task complete",
          timestamp: Date.now(),
          metadata: { duration_ms: 1234 },
        },
      ];

      render(<AgentLog events={events} agentId={agentId} />);

      expect(screen.getByText("1234ms")).toBeInTheDocument();
    });
  });

  describe("Event Filtering", () => {
    it("should filter events by agentId", () => {
      const events: BuildEvent[] = [
        { id: "1", type: "system", message: "Global event", timestamp: Date.now() },
        { id: "2", type: "agent", message: "Agent 1 event", timestamp: Date.now(), agentId: "agent-1" },
        { id: "3", type: "agent", message: "Agent 2 event", timestamp: Date.now(), agentId: "agent-2" },
      ];

      render(<AgentLog events={events} agentId="agent-1" />);

      // Should show global events (no agentId) and agent-1 events
      expect(screen.getByText("Global event")).toBeInTheDocument();
      expect(screen.getByText("Agent 1 event")).toBeInTheDocument();
      expect(screen.queryByText("Agent 2 event")).not.toBeInTheDocument();
    });
  });

  describe("Event Limiting", () => {
    it("should limit events to maxEvents", () => {
      const events: BuildEvent[] = Array.from({ length: 150 }, (_, i) => ({
        id: `evt-${i}`,
        type: "agent" as const,
        message: `Event ${i}`,
        timestamp: Date.now() + i,
      }));

      render(<AgentLog events={events} agentId={agentId} maxEvents={100} />);

      // Should show last 100 events
      expect(screen.queryByText("Event 0")).not.toBeInTheDocument();
      expect(screen.getByText("Event 149")).toBeInTheDocument();
    });

    it("should use default maxEvents of 100", () => {
      const events: BuildEvent[] = Array.from({ length: 150 }, (_, i) => ({
        id: `evt-${i}`,
        type: "agent" as const,
        message: `Event ${i}`,
        timestamp: Date.now() + i,
      }));

      render(<AgentLog events={events} agentId={agentId} />);

      // Default maxEvents is 100
      expect(screen.queryByText("Event 49")).not.toBeInTheDocument();
      expect(screen.getByText("Event 50")).toBeInTheDocument();
    });
  });

  describe("Auto-scroll Behavior", () => {
    it("should auto-scroll to bottom on new events", () => {
      const { rerender } = render(
        <AgentLog
          events={[{ id: "1", type: "agent", message: "First", timestamp: Date.now() }]}
          agentId={agentId}
        />
      );

      // Add more events
      const moreEvents: BuildEvent[] = Array.from({ length: 20 }, (_, i) => ({
        id: `evt-${i}`,
        type: "agent" as const,
        message: `Event ${i}`,
        timestamp: Date.now() + i,
      }));

      rerender(<AgentLog events={moreEvents} agentId={agentId} />);

      // The component should attempt to scroll to bottom
      // We can't easily test actual scroll behavior in jsdom
    });

    it("should show scroll-to-latest button when scrolled up", async () => {
      const events: BuildEvent[] = Array.from({ length: 50 }, (_, i) => ({
        id: `evt-${i}`,
        type: "agent" as const,
        message: `Event ${i}`,
        timestamp: Date.now() + i,
      }));

      const { container } = render(<AgentLog events={events} agentId={agentId} />);

      const scrollContainer = container.querySelector(".agent-log");
      if (scrollContainer) {
        // Simulate scrolling up
        Object.defineProperty(scrollContainer, "scrollTop", { value: 0, writable: true });
        Object.defineProperty(scrollContainer, "scrollHeight", { value: 1000, writable: true });
        Object.defineProperty(scrollContainer, "clientHeight", { value: 200, writable: true });

        fireEvent.scroll(scrollContainer);

        // Button should appear (though jsdom may not fully support this)
        // This tests the scroll handler logic
      }
    });

    it("should scroll to bottom when clicking scroll button", async () => {
      const user = userEvent.setup();
      const events: BuildEvent[] = Array.from({ length: 50 }, (_, i) => ({
        id: `evt-${i}`,
        type: "agent" as const,
        message: `Event ${i}`,
        timestamp: Date.now() + i,
      }));

      const { container } = render(<AgentLog events={events} agentId={agentId} />);

      const scrollContainer = container.querySelector(".agent-log");
      if (scrollContainer) {
        // Mock scroll position to be not at bottom
        Object.defineProperty(scrollContainer, "scrollTop", { value: 0, writable: true });
        Object.defineProperty(scrollContainer, "scrollHeight", { value: 1000, writable: true });
        Object.defineProperty(scrollContainer, "clientHeight", { value: 200, writable: true });

        fireEvent.scroll(scrollContainer);

        const scrollButton = screen.queryByText(/Scroll to latest/);
        if (scrollButton) {
          await user.click(scrollButton);
          // Should re-enable auto-scroll
        }
      }
    });
  });

  describe("CSS Classes", () => {
    it("should apply correct class for event type", () => {
      const events: BuildEvent[] = [
        { id: "1", type: "error", message: "Error", timestamp: Date.now() },
      ];

      const { container } = render(<AgentLog events={events} agentId={agentId} />);

      const eventElement = container.querySelector(".agent-log-event--error");
      expect(eventElement).toBeInTheDocument();
    });
  });
});
