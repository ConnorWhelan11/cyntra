import { useState, useCallback, useRef, useEffect } from "react";
import type { EntityConfig, TriggerConfig, InteractionConfig, GameplayAction } from "@/types";

export type MarkerType = "npc" | "item" | "trigger" | "interaction" | "audio_zone";

export interface MarkerInfo {
  id: string;
  type: MarkerType;
  position?: { x: number; y: number };
  data?: EntityConfig | TriggerConfig | InteractionConfig;
  isValid?: boolean;
  missingMarker?: boolean;
}

interface MarkerPopoverProps {
  marker: MarkerInfo;
  isOpen: boolean;
  anchorPosition: { x: number; y: number };
  onClose: () => void;
  onEdit?: (markerId: string, type: MarkerType) => void;
  onNavigateToGameplay?: () => void;
}

/**
 * MarkerPopover - Contextual popover for 3D markers in Stage view
 *
 * Shows entity/trigger details when clicking markers in the game preview.
 * Provides quick actions like "Edit in Gameplay" or "View Details".
 */
export function MarkerPopover({
  marker,
  isOpen,
  anchorPosition,
  onClose,
  onEdit,
  onNavigateToGameplay,
}: MarkerPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Calculate position to keep popover in viewport
  useEffect(() => {
    if (!isOpen || !popoverRef.current) return;

    const popover = popoverRef.current;
    const rect = popover.getBoundingClientRect();
    const padding = 16;

    let x = anchorPosition.x;
    let y = anchorPosition.y;

    // Adjust horizontal position
    if (x + rect.width + padding > window.innerWidth) {
      x = anchorPosition.x - rect.width - padding;
    }

    // Adjust vertical position
    if (y + rect.height + padding > window.innerHeight) {
      y = window.innerHeight - rect.height - padding;
    }

    setPosition({ x: Math.max(padding, x), y: Math.max(padding, y) });
  }, [isOpen, anchorPosition]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  const handleEdit = useCallback(() => {
    if (onEdit) {
      onEdit(marker.id, marker.type);
    }
    onClose();
  }, [marker, onEdit, onClose]);

  const handleNavigate = useCallback(() => {
    if (onNavigateToGameplay) {
      onNavigateToGameplay();
    }
    onClose();
  }, [onNavigateToGameplay, onClose]);

  if (!isOpen) return null;

  const typeLabel = getTypeLabel(marker.type);
  const typeColor = getTypeColor(marker.type);

  return (
    <div
      ref={popoverRef}
      className="marker-popover"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {/* Header */}
      <div className="marker-popover-header">
        <span
          className="marker-popover-type"
          style={{ background: typeColor }}
        >
          {typeLabel}
        </span>
        <span className="marker-popover-id">{marker.id}</span>
        {marker.isValid === false && (
          <span className="marker-popover-invalid" title="Missing marker in GLB">
            ⚠
          </span>
        )}
        <button className="marker-popover-close" onClick={onClose}>
          ×
        </button>
      </div>

      {/* Content based on type */}
      <div className="marker-popover-content">
        {marker.type === "npc" && marker.data && (
          <NPCDetails entity={marker.data as EntityConfig} />
        )}
        {(marker.type === "item") && marker.data && (
          <ItemDetails entity={marker.data as EntityConfig} />
        )}
        {marker.type === "trigger" && marker.data && (
          <TriggerDetails trigger={marker.data as TriggerConfig} />
        )}
        {marker.type === "interaction" && marker.data && (
          <InteractionDetails interaction={marker.data as InteractionConfig} />
        )}
        {!marker.data && (
          <div className="marker-popover-empty">
            No data available for this marker
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="marker-popover-actions">
        {onEdit && (
          <button className="marker-popover-btn" onClick={handleEdit}>
            Edit
          </button>
        )}
        {onNavigateToGameplay && (
          <button
            className="marker-popover-btn marker-popover-btn--primary"
            onClick={handleNavigate}
          >
            Open in Gameplay
          </button>
        )}
      </div>

    </div>
  );
}

// Sub-components for different marker types

function NPCDetails({ entity }: { entity: EntityConfig }) {
  return (
    <>
      {entity.display_name && (
        <div className="marker-detail">
          <div className="marker-detail-label">Display Name</div>
          <div className="marker-detail-value">{entity.display_name}</div>
        </div>
      )}
      {entity.behavior && (
        <div className="marker-detail">
          <div className="marker-detail-label">Behavior</div>
          <div className="marker-detail-value">{entity.behavior}</div>
        </div>
      )}
      {entity.dialogue && (
        <div className="marker-detail">
          <div className="marker-detail-label">Dialogue</div>
          <div className="marker-detail-value marker-detail-value--muted">
            {entity.dialogue}
          </div>
        </div>
      )}
    </>
  );
}

function ItemDetails({ entity }: { entity: EntityConfig }) {
  return (
    <>
      {entity.display_name && (
        <div className="marker-detail">
          <div className="marker-detail-label">Display Name</div>
          <div className="marker-detail-value">{entity.display_name}</div>
        </div>
      )}
      <div className="marker-detail">
        <div className="marker-detail-label">Item Type</div>
        <div className="marker-detail-value">{entity.type}</div>
      </div>
      {entity.description && (
        <div className="marker-detail">
          <div className="marker-detail-label">Description</div>
          <div className="marker-detail-value marker-detail-value--muted">
            {entity.description}
          </div>
        </div>
      )}
    </>
  );
}

function TriggerDetails({ trigger }: { trigger: TriggerConfig }) {
  return (
    <>
      <div className="marker-detail">
        <div className="marker-detail-label">Trigger Type</div>
        <div className="marker-detail-value">{trigger.type}</div>
      </div>
      {trigger.marker && (
        <div className="marker-detail">
          <div className="marker-detail-label">Marker</div>
          <div className="marker-detail-value marker-detail-value--muted">
            {trigger.marker}
          </div>
        </div>
      )}
      <div className="marker-detail">
        <div className="marker-detail-label">One-time</div>
        <div className="marker-detail-value">{trigger.once ? "Yes" : "No"}</div>
      </div>
      {trigger.actions && trigger.actions.length > 0 && (
        <div className="marker-detail">
          <div className="marker-detail-label">
            Actions ({trigger.actions.length})
          </div>
          <div className="marker-detail-list">
            {trigger.actions.slice(0, 3).map((action, i) => (
              <span key={i} className="marker-detail-tag">
                {getGameplayActionKind(action)}
              </span>
            ))}
            {trigger.actions.length > 3 && (
              <span className="marker-detail-tag">
                +{trigger.actions.length - 3}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function InteractionDetails({ interaction }: { interaction: InteractionConfig }) {
  return (
    <>
      {interaction.display_name && (
        <div className="marker-detail">
          <div className="marker-detail-label">Display Name</div>
          <div className="marker-detail-value">{interaction.display_name}</div>
        </div>
      )}
      <div className="marker-detail">
        <div className="marker-detail-label">Interaction Type</div>
        <div className="marker-detail-value">{interaction.type}</div>
      </div>
      {interaction.description && (
        <div className="marker-detail">
          <div className="marker-detail-label">Description</div>
          <div className="marker-detail-value marker-detail-value--muted">
            {interaction.description}
          </div>
        </div>
      )}
    </>
  );
}

// Helper functions

function getTypeLabel(type: MarkerType): string {
  switch (type) {
    case "npc":
      return "NPC";
    case "item":
      return "Item";
    case "trigger":
      return "Trigger";
    case "interaction":
      return "Interact";
    case "audio_zone":
      return "Audio";
    default:
      return type;
  }
}

function getTypeColor(type: MarkerType): string {
  switch (type) {
    case "npc":
      return "#60a5fa"; // Blue
    case "item":
      return "#fbbf24"; // Gold
    case "trigger":
      return "#22d3ee"; // Cyan
    case "interaction":
      return "#c084fc"; // Purple
    case "audio_zone":
      return "#a78bfa"; // Violet
    default:
      return "#888888";
  }
}

export default MarkerPopover;

function getGameplayActionKind(action: GameplayAction): string {
  const keys = Object.keys(action);
  if (keys.length === 0) return "action";
  return keys[0].replaceAll("_", " ");
}
