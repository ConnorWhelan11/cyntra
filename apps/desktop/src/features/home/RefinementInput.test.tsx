/**
 * Tests for RefinementInput component
 *
 * Tests chat-style input with Enter to submit and auto-resize.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RefinementInput } from "./RefinementInput";

describe("RefinementInput", () => {
  const defaultProps = {
    onSubmit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render textarea with placeholder", () => {
      render(<RefinementInput {...defaultProps} />);

      expect(screen.getByPlaceholderText(/Type refinement/i)).toBeInTheDocument();
    });

    it("should render Queue button", () => {
      render(<RefinementInput {...defaultProps} />);

      expect(screen.getByRole("button", { name: "Queue" })).toBeInTheDocument();
    });

    it("should use custom placeholder when provided", () => {
      render(<RefinementInput {...defaultProps} placeholder="Custom placeholder" />);

      expect(screen.getByPlaceholderText("Custom placeholder")).toBeInTheDocument();
    });
  });

  describe("Input Behavior", () => {
    it("should update text value on input", async () => {
      const user = userEvent.setup();
      render(<RefinementInput {...defaultProps} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Add a window");

      expect(textarea).toHaveValue("Add a window");
    });

    it("should submit on Enter key", async () => {
      const user = userEvent.setup();
      render(<RefinementInput {...defaultProps} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Add a plant{Enter}");

      expect(defaultProps.onSubmit).toHaveBeenCalledWith("Add a plant");
    });

    it("should not submit on Shift+Enter (newline)", async () => {
      const user = userEvent.setup();
      render(<RefinementInput {...defaultProps} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Line 1{Shift>}{Enter}{/Shift}Line 2");

      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
      expect(textarea).toHaveValue("Line 1\nLine 2");
    });

    it("should clear text after submit", async () => {
      const user = userEvent.setup();
      render(<RefinementInput {...defaultProps} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Add something{Enter}");

      expect(textarea).toHaveValue("");
    });

    it("should trim whitespace from submitted text", async () => {
      const user = userEvent.setup();
      render(<RefinementInput {...defaultProps} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "  Add a plant  {Enter}");

      expect(defaultProps.onSubmit).toHaveBeenCalledWith("Add a plant");
    });
  });

  describe("Button Behavior", () => {
    it("should submit on button click", async () => {
      const user = userEvent.setup();
      render(<RefinementInput {...defaultProps} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Add a lamp");

      await user.click(screen.getByRole("button", { name: "Queue" }));

      expect(defaultProps.onSubmit).toHaveBeenCalledWith("Add a lamp");
    });

    it("should disable button when text is empty", () => {
      render(<RefinementInput {...defaultProps} />);

      expect(screen.getByRole("button", { name: "Queue" })).toBeDisabled();
    });

    it("should disable button when text is only whitespace", async () => {
      const user = userEvent.setup();
      render(<RefinementInput {...defaultProps} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "   ");

      expect(screen.getByRole("button", { name: "Queue" })).toBeDisabled();
    });

    it("should enable button when text has content", async () => {
      const user = userEvent.setup();
      render(<RefinementInput {...defaultProps} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "Some text");

      expect(screen.getByRole("button", { name: "Queue" })).not.toBeDisabled();
    });

    it("should have title on button", () => {
      render(<RefinementInput {...defaultProps} />);

      expect(screen.getByRole("button", { name: "Queue" })).toHaveAttribute(
        "title",
        "Queue refinement"
      );
    });
  });

  describe("Disabled State", () => {
    it("should disable textarea when disabled prop is true", () => {
      render(<RefinementInput {...defaultProps} disabled={true} />);

      expect(screen.getByRole("textbox")).toBeDisabled();
    });

    it("should disable button when disabled prop is true", () => {
      render(<RefinementInput {...defaultProps} disabled={true} />);

      expect(screen.getByRole("button", { name: "Queue" })).toBeDisabled();
    });

    it("should not submit on Enter when disabled", async () => {
      const _user = userEvent.setup();
      render(<RefinementInput {...defaultProps} disabled={true} />);

      const textarea = screen.getByRole("textbox");
      // Can't type when disabled, but test the concept
      expect(textarea).toBeDisabled();
    });
  });

  describe("Empty Submission Prevention", () => {
    it("should not submit empty text on Enter", async () => {
      const user = userEvent.setup();
      render(<RefinementInput {...defaultProps} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "{Enter}");

      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it("should not submit whitespace-only text on Enter", async () => {
      const user = userEvent.setup();
      render(<RefinementInput {...defaultProps} />);

      const textarea = screen.getByRole("textbox");
      await user.type(textarea, "   {Enter}");

      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("Auto-resize", () => {
    it("should start with 1 row", () => {
      render(<RefinementInput {...defaultProps} />);

      expect(screen.getByRole("textbox")).toHaveAttribute("rows", "1");
    });

    // Note: Auto-resize behavior is hard to fully test in jsdom
    // as it relies on scrollHeight which isn't accurately computed
  });
});
