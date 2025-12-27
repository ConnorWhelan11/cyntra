/**
 * RefinementInput - Chat-style input for sending refinements during build
 *
 * Supports Enter to queue and Shift+Enter for newlines.
 */

import React, { useState, useCallback, useRef, KeyboardEvent } from "react";

interface RefinementInputProps {
  /** Called when user submits a refinement */
  onSubmit: (text: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Disable input */
  disabled?: boolean;
}

export function RefinementInput({
  onSubmit,
  placeholder = "Type refinement... (Enter to queue, Shift+Enter for newline)",
  disabled = false,
}: RefinementInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle submit
  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;

    onSubmit(trimmed);
    setText("");

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, onSubmit]);

  // Handle key down
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  // Auto-resize textarea
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);

    // Auto-resize
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  return (
    <div className="refinement-input">
      <textarea
        ref={textareaRef}
        className="refinement-input-textarea"
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
      />
      <button
        className="refinement-input-btn"
        onClick={handleSubmit}
        disabled={disabled || !text.trim()}
        title="Queue refinement"
      >
        Queue
      </button>
    </div>
  );
}

export default RefinementInput;
