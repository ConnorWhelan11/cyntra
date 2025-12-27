/**
 * Tests for RefinementQueue component
 *
 * Tests the display of pending refinements with Apply Now option.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RefinementQueue } from "./RefinementQueue";
import { mockRefinements } from "./fixtures";
import type { RefinementMessage } from "@/types";

describe("RefinementQueue", () => {
  const defaultProps = {
    refinements: mockRefinements,
    onApplyNow: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Empty State", () => {
    it("should render nothing when no refinements", () => {
      const { container } = render(<RefinementQueue refinements={[]} onApplyNow={vi.fn()} />);

      expect(container.firstChild).toBeNull();
    });

    it("should render nothing when all refinements are applied", () => {
      const appliedRefinements: RefinementMessage[] = [
        { id: "1", text: "Applied", timestamp: Date.now(), status: "applied" },
      ];

      const { container } = render(
        <RefinementQueue refinements={appliedRefinements} onApplyNow={vi.fn()} />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe("Rendering", () => {
    it("should show header with count", () => {
      render(<RefinementQueue {...defaultProps} />);

      // mockRefinements has 2 items (1 queued, 1 pending)
      expect(screen.getByText("Queued Refinements (2)")).toBeInTheDocument();
    });

    it("should render pending and queued refinements", () => {
      render(<RefinementQueue {...defaultProps} />);

      // From mockRefinements fixture
      expect(screen.getByText(/Add a potted plant/)).toBeInTheDocument();
      expect(screen.getByText(/Make the lighting/)).toBeInTheDocument();
    });

    it("should truncate long refinement text", () => {
      const longRefinements: RefinementMessage[] = [
        {
          id: "1",
          text: "This is a very long refinement text that should be truncated after 50 characters to fit in the UI nicely",
          timestamp: Date.now(),
          status: "queued",
        },
      ];

      render(<RefinementQueue refinements={longRefinements} onApplyNow={vi.fn()} />);

      // Truncated at 50 chars + "..."
      expect(
        screen.getByText("This is a very long refinement text that should be...")
      ).toBeInTheDocument();
    });

    it("should not truncate short refinement text", () => {
      const shortRefinements: RefinementMessage[] = [
        {
          id: "1",
          text: "Short text",
          timestamp: Date.now(),
          status: "queued",
        },
      ];

      render(<RefinementQueue refinements={shortRefinements} onApplyNow={vi.fn()} />);

      expect(screen.getByText("Short text")).toBeInTheDocument();
      expect(screen.queryByText(/\.\.\./)).not.toBeInTheDocument();
    });

    it("should show full text in title attribute", () => {
      const longRefinements: RefinementMessage[] = [
        {
          id: "1",
          text: "This is a very long refinement text that should be truncated",
          timestamp: Date.now(),
          status: "queued",
        },
      ];

      render(<RefinementQueue refinements={longRefinements} onApplyNow={vi.fn()} />);

      const textElement = screen.getByTitle(
        "This is a very long refinement text that should be truncated"
      );
      expect(textElement).toBeInTheDocument();
    });
  });

  describe("Status Display", () => {
    it.each([
      ["pending", "Pending"],
      ["queued", "Queued"],
    ])("should display %s status as %s", (status, expectedText) => {
      const refinements: RefinementMessage[] = [
        { id: "1", text: "Test", timestamp: Date.now(), status: status as any },
      ];

      render(<RefinementQueue refinements={refinements} onApplyNow={vi.fn()} />);

      expect(screen.getByText(expectedText)).toBeInTheDocument();
    });

    it("should set data-status attribute", () => {
      const refinements: RefinementMessage[] = [
        { id: "1", text: "Test", timestamp: Date.now(), status: "queued" },
      ];

      const { container } = render(
        <RefinementQueue refinements={refinements} onApplyNow={vi.fn()} />
      );

      const statusElement = container.querySelector('[data-status="queued"]');
      expect(statusElement).toBeInTheDocument();
    });
  });

  describe("Apply Now Button", () => {
    it("should show Apply Now button for queued refinements", () => {
      const queuedRefinements: RefinementMessage[] = [
        { id: "1", text: "Queued item", timestamp: Date.now(), status: "queued" },
      ];

      render(<RefinementQueue refinements={queuedRefinements} onApplyNow={vi.fn()} />);

      expect(screen.getByRole("button", { name: "Apply Now" })).toBeInTheDocument();
    });

    it("should not show Apply Now button for pending refinements", () => {
      const pendingRefinements: RefinementMessage[] = [
        { id: "1", text: "Pending item", timestamp: Date.now(), status: "pending" },
      ];

      render(<RefinementQueue refinements={pendingRefinements} onApplyNow={vi.fn()} />);

      expect(screen.queryByRole("button", { name: "Apply Now" })).not.toBeInTheDocument();
    });

    it("should call onApplyNow with refinement id", async () => {
      const user = userEvent.setup();
      const queuedRefinements: RefinementMessage[] = [
        { id: "ref-123", text: "Apply this", timestamp: Date.now(), status: "queued" },
      ];

      render(
        <RefinementQueue refinements={queuedRefinements} onApplyNow={defaultProps.onApplyNow} />
      );

      await user.click(screen.getByRole("button", { name: "Apply Now" }));

      expect(defaultProps.onApplyNow).toHaveBeenCalledWith("ref-123");
    });

    it("should have descriptive title", () => {
      const queuedRefinements: RefinementMessage[] = [
        { id: "1", text: "Test", timestamp: Date.now(), status: "queued" },
      ];

      render(<RefinementQueue refinements={queuedRefinements} onApplyNow={vi.fn()} />);

      expect(screen.getByRole("button", { name: "Apply Now" })).toHaveAttribute(
        "title",
        "Apply this refinement immediately (interrupts current work)"
      );
    });
  });

  describe("Multiple Refinements", () => {
    it("should render multiple Apply Now buttons for multiple queued items", () => {
      const multipleQueued: RefinementMessage[] = [
        { id: "1", text: "First", timestamp: Date.now(), status: "queued", issueId: "issue-1" },
        { id: "2", text: "Second", timestamp: Date.now(), status: "queued", issueId: "issue-2" },
        { id: "3", text: "Third", timestamp: Date.now(), status: "pending" },
      ];

      render(<RefinementQueue refinements={multipleQueued} onApplyNow={vi.fn()} />);

      expect(screen.getAllByRole("button", { name: "Apply Now" })).toHaveLength(2);
    });

    it("should call onApplyNow with correct id for each button", async () => {
      const user = userEvent.setup();
      const multipleQueued: RefinementMessage[] = [
        {
          id: "ref-1",
          text: "First queued",
          timestamp: Date.now(),
          status: "queued",
          issueId: "issue-1",
        },
        {
          id: "ref-2",
          text: "Second queued",
          timestamp: Date.now(),
          status: "queued",
          issueId: "issue-2",
        },
      ];

      render(<RefinementQueue refinements={multipleQueued} onApplyNow={defaultProps.onApplyNow} />);

      const buttons = screen.getAllByRole("button", { name: "Apply Now" });
      await user.click(buttons[1]);

      expect(defaultProps.onApplyNow).toHaveBeenCalledWith("ref-2");
    });
  });

  describe("Filtering Applied/Applying Refinements", () => {
    it("should not show applying refinements", () => {
      const refinements: RefinementMessage[] = [
        { id: "1", text: "Applying one", timestamp: Date.now(), status: "applying" },
        { id: "2", text: "Queued one", timestamp: Date.now(), status: "queued" },
      ];

      render(<RefinementQueue refinements={refinements} onApplyNow={vi.fn()} />);

      expect(screen.queryByText(/Applying one/)).not.toBeInTheDocument();
      expect(screen.getByText(/Queued one/)).toBeInTheDocument();
    });

    it("should show correct count excluding applied/applying", () => {
      const refinements: RefinementMessage[] = [
        { id: "1", text: "Applied", timestamp: Date.now(), status: "applied" },
        { id: "2", text: "Applying", timestamp: Date.now(), status: "applying" },
        { id: "3", text: "Queued", timestamp: Date.now(), status: "queued" },
        { id: "4", text: "Pending", timestamp: Date.now(), status: "pending" },
      ];

      render(<RefinementQueue refinements={refinements} onApplyNow={vi.fn()} />);

      // Only queued and pending should be counted
      expect(screen.getByText("Queued Refinements (2)")).toBeInTheDocument();
    });
  });

  describe("List Structure", () => {
    it("should render as unordered list", () => {
      render(<RefinementQueue {...defaultProps} />);

      expect(screen.getByRole("list")).toBeInTheDocument();
    });

    it("should render each refinement as list item", () => {
      render(<RefinementQueue {...defaultProps} />);

      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });

    it("should show bullet points for items", () => {
      render(<RefinementQueue {...defaultProps} />);

      // Each item has a bullet
      expect(screen.getAllByText("•")).toHaveLength(2);
    });
  });
});
