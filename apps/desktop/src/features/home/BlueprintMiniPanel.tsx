/**
 * BlueprintMiniPanel - Live configuration preview
 *
 * Shows the current world blueprint configuration derived from
 * prompt analysis and template defaults. Collapses when console unfocused.
 */

import React from "react";
import type { BlueprintDraft, WorldRuntime } from "@/types";

interface BlueprintMiniPanelProps {
  blueprint: BlueprintDraft;
  onUpdate: (partial: Partial<BlueprintDraft>) => void;
  expanded: boolean;
  disabled?: boolean;
}

const RUNTIME_OPTIONS: { value: WorldRuntime; label: string; icon: string }[] = [
  { value: "three", label: "Three.js", icon: "\u25B3" },
  { value: "godot", label: "Godot", icon: "\u2B21" },
  { value: "hybrid", label: "Hybrid", icon: "\u2B22" },
];

const OUTPUT_OPTIONS = [
  { value: "viewer", label: "Viewer" },
  { value: "build", label: "Build" },
  { value: "publish", label: "Publish" },
] as const;

export function BlueprintMiniPanel({
  blueprint,
  onUpdate,
  expanded,
  disabled = false,
}: BlueprintMiniPanelProps) {
  const toggleOutput = (output: "viewer" | "build" | "publish") => {
    const outputs = blueprint.outputs.includes(output)
      ? blueprint.outputs.filter((o) => o !== output)
      : [...blueprint.outputs, output];
    onUpdate({ outputs: outputs.length > 0 ? outputs : ["viewer"] });
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ name: e.target.value });
  };

  const handleRuntimeChange = (runtime: WorldRuntime) => {
    onUpdate({ runtime });
  };

  return (
    <div
      className={`blueprint-mini-panel ${expanded ? "expanded" : "collapsed"}`}
      aria-hidden={!expanded}
    >
      <div className="blueprint-mini-header">
        <span className="blueprint-mini-title">Blueprint</span>
        <span className="blueprint-mini-indicator" />
      </div>

      <div className="blueprint-mini-content">
        {/* World Name */}
        <div className="blueprint-field">
          <label className="blueprint-label">Name</label>
          <input
            type="text"
            value={blueprint.name}
            onChange={handleNameChange}
            placeholder="Auto-generated"
            className="blueprint-input"
            disabled={disabled}
            aria-label="World name"
          />
        </div>

        {/* Runtime */}
        <div className="blueprint-field">
          <label className="blueprint-label">Runtime</label>
          <div className="blueprint-toggle-group">
            {RUNTIME_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleRuntimeChange(option.value)}
                disabled={disabled}
                className={`blueprint-toggle ${blueprint.runtime === option.value ? "active" : ""}`}
                title={option.label}
                aria-pressed={blueprint.runtime === option.value}
              >
                <span className="blueprint-toggle-icon">{option.icon}</span>
                <span className="blueprint-toggle-label">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Outputs */}
        <div className="blueprint-field">
          <label className="blueprint-label">Outputs</label>
          <div className="blueprint-chip-group">
            {OUTPUT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => toggleOutput(option.value)}
                disabled={disabled}
                className={`blueprint-chip ${
                  blueprint.outputs.includes(option.value) ? "active" : ""
                }`}
                aria-pressed={blueprint.outputs.includes(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Gates */}
        {blueprint.gates.length > 0 && (
          <div className="blueprint-field">
            <label className="blueprint-label">Gates</label>
            <div className="blueprint-chip-group blueprint-chip-group-readonly">
              {blueprint.gates.map((gate) => (
                <span key={gate} className="blueprint-chip readonly">
                  {gate}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {blueprint.tags.length > 0 && (
          <div className="blueprint-field">
            <label className="blueprint-label">Tags</label>
            <div className="blueprint-tags">
              {blueprint.tags.map((tag) => (
                <span key={tag} className="blueprint-tag">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
