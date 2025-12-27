/**
 * TemplateGallery - Grid of prompt pack templates
 *
 * Displays available world templates. Supports keyboard navigation.
 */

import React, { useCallback, useRef } from "react";
import type { WorldTemplate } from "@/types";
import { TemplateCard } from "./TemplateCard";

interface TemplateGalleryProps {
  templates: WorldTemplate[];
  selectedTemplateId: string | null;
  onSelectTemplate: (id: string | null) => void;
  disabled?: boolean;
}

export function TemplateGallery({
  templates,
  selectedTemplateId,
  onSelectTemplate,
  disabled = false,
}: TemplateGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle template click - toggle if already selected
  const handleTemplateClick = useCallback(
    (templateId: string) => {
      if (selectedTemplateId === templateId) {
        onSelectTemplate(null); // Deselect
      } else {
        onSelectTemplate(templateId);
      }
    },
    [selectedTemplateId, onSelectTemplate]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!containerRef.current) return;

    const cards = containerRef.current.querySelectorAll<HTMLButtonElement>(".template-card");
    const currentIndex = Array.from(cards).findIndex((card) => card === document.activeElement);

    let nextIndex = currentIndex;

    switch (e.key) {
      case "ArrowRight":
        nextIndex = Math.min(currentIndex + 1, cards.length - 1);
        break;
      case "ArrowLeft":
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case "ArrowDown":
        // Single-row gallery: down/up mirror right/left for keyboard parity
        nextIndex = Math.min(currentIndex + 1, cards.length - 1);
        break;
      case "ArrowUp":
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = cards.length - 1;
        break;
      default:
        return;
    }

    if (nextIndex !== currentIndex) {
      e.preventDefault();
      cards[nextIndex]?.focus();
      cards[nextIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, []);

  return (
    <section className="template-gallery" aria-labelledby="template-gallery-title">
      <h2 id="template-gallery-title" className="template-gallery-title">
        Start from a template
      </h2>
      <p className="template-gallery-subtitle">Quick-start configurations for common world types</p>

      <div
        ref={containerRef}
        className="template-gallery-row"
        role="listbox"
        aria-label="World templates"
        onKeyDown={handleKeyDown}
      >
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            selected={selectedTemplateId === template.id}
            onClick={() => handleTemplateClick(template.id)}
            disabled={disabled}
          />
        ))}
      </div>
    </section>
  );
}
