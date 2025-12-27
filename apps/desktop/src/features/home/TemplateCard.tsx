/**
 * TemplateCard - Individual prompt pack card
 *
 * Glass card that shows template preview. Click prefills console.
 */

import { PixelCanvas } from "@oos/ag-ui-ext";
import type { WorldTemplate } from "@/types";

const TEMPLATE_PIXEL_COLORS = [
  "rgba(20, 184, 166, 0.26)", // teal
  "rgba(139, 92, 246, 0.22)", // violet
  "rgba(245, 158, 11, 0.22)", // amber
  "rgba(148, 163, 184, 0.12)", // slate
];

interface TemplateCardProps {
  template: WorldTemplate;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export function TemplateCard({ template, selected, onClick, disabled = false }: TemplateCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`template-card ${selected ? "selected" : ""}`}
      data-template-id={template.id}
      aria-pressed={selected}
      aria-label={`Select ${template.title} template`}
    >
      {/* Pixelated UV substrate */}
      <PixelCanvas
        className="template-card-uv"
        colors={TEMPLATE_PIXEL_COLORS}
        gap={6}
        speed={28}
        variant="default"
      />
      <div className="template-card-uv-overlay" aria-hidden="true" />

      {/* Sigil */}
      <div className="template-card-sigil" aria-hidden="true">
        <span className="template-sigil-dot teal" />
        <span className="template-sigil-dot violet" />
        <span className="template-sigil-dot amber" />
      </div>

      {/* Content */}
      <div className="template-card-content">
        <h3 className="template-card-title">{template.title}</h3>
        <ul className="template-card-bullets">
          {template.previewBullets.slice(0, 3).map((bullet, i) => (
            <li key={i}>{bullet}</li>
          ))}
        </ul>
      </div>

      {/* Selected indicator */}
      {selected && (
        <div className="template-card-selected-indicator" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
          </svg>
        </div>
      )}
    </button>
  );
}
