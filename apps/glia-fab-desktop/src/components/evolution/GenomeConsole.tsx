/**
 * GenomeConsole - Bottom console for genome steering
 * Features grouped parameters, exploit/explore dial, and gene sliders with intent arrows
 */

import React, { useState, useMemo, useCallback } from "react";
import type { GenomeParameter, GenomeGroup } from "@/types";
import { ExploitExploreSlider } from "./ExploitExploreSlider";

interface GenomeConsoleProps {
  parameters: GenomeParameter[];
  exploitExplore: number;
  onExploitExploreChange: (value: number) => void;
  onParameterChange: (name: string, value: number | string) => void;
  onApplyChanges: () => void;
  onMutateRandom: () => void;
  isRunning: boolean;
  hasChanges: boolean;
  className?: string;
}

// Group parameters by prefix or category
function groupParameters(params: GenomeParameter[]): GenomeGroup[] {
  const groups: Record<string, GenomeParameter[]> = {};
  const icons: Record<string, string> = {
    lighting: "\u{1F4A1}",
    light: "\u{1F4A1}",
    material: "\u{1F9F1}",
    mat: "\u{1F9F1}",
    layout: "\u{1F4D0}",
    structure: "\u{1F3D7}",
    color: "\u{1F3A8}",
    geometry: "\u{1F4D0}",
    other: "\u{2699}",
  };

  params.forEach((param) => {
    // Extract group from parameter name (e.g., "lighting_intensity" -> "lighting")
    const parts = param.name.toLowerCase().split(/[_\-.]/);
    let groupKey = parts[0];

    // Normalize common prefixes
    if (groupKey.startsWith("mat")) groupKey = "material";
    if (groupKey.startsWith("light")) groupKey = "lighting";

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(param);
  });

  // Convert to array and sort
  return Object.entries(groups).map(([id, parameters]) => ({
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    icon: icons[id] || icons.other,
    parameters,
  }));
}

// Individual parameter slider
function ParameterSlider({
  param,
  onChange,
  pendingValue,
}: {
  param: GenomeParameter;
  onChange: (value: number | string) => void;
  pendingValue?: number | string;
}) {
  if (param.type === "enum" && param.options) {
    return (
      <div className="flex items-center gap-2">
        <label className="text-xs text-secondary w-28 truncate" title={param.name}>
          {param.name}
        </label>
        <select
          value={pendingValue ?? param.value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 text-xs bg-void border border-slate/30 rounded px-2 py-1 text-primary"
        >
          {param.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {pendingValue !== undefined && pendingValue !== param.value && (
          <IntentArrow from={param.value} to={pendingValue} />
        )}
      </div>
    );
  }

  if (param.type === "number") {
    const min = param.min ?? 0;
    const max = param.max ?? 1;
    const step = param.step ?? 0.01;
    const current = (pendingValue ?? param.value) as number;
    const percent = ((current - min) / (max - min)) * 100;

    return (
      <div className="flex items-center gap-2">
        <label className="text-xs text-secondary w-28 truncate" title={param.name}>
          {param.name}
        </label>
        <div className="flex-1 relative">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={current}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(90deg, var(--evo-mitosis) ${percent}%, var(--void) ${percent}%)`,
            }}
          />
        </div>
        <span className="text-xs font-mono text-primary w-12 text-right">
          {current.toFixed(2)}
        </span>
        {pendingValue !== undefined && pendingValue !== param.value && (
          <IntentArrow from={param.value as number} to={pendingValue as number} />
        )}
      </div>
    );
  }

  // String type
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-secondary w-28 truncate" title={param.name}>
        {param.name}
      </label>
      <input
        type="text"
        value={pendingValue ?? param.value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 text-xs bg-void border border-slate/30 rounded px-2 py-1 text-primary"
      />
    </div>
  );
}

// Intent arrow showing change direction
function IntentArrow({
  from,
  to,
}: {
  from: number | string;
  to: number | string;
}) {
  const isIncrease = typeof from === "number" && typeof to === "number" && to > from;
  const isDecrease = typeof from === "number" && typeof to === "number" && to < from;

  return (
    <span
      className="text-xs font-mono"
      style={{
        color: isIncrease
          ? "var(--evo-high)"
          : isDecrease
          ? "var(--evo-low)"
          : "var(--evo-mid)",
      }}
    >
      {isIncrease ? "\u2191" : isDecrease ? "\u2193" : "\u2194"}
    </span>
  );
}

export function GenomeConsole({
  parameters,
  exploitExplore,
  onExploitExploreChange,
  onParameterChange,
  onApplyChanges,
  onMutateRandom,
  isRunning,
  hasChanges,
  className = "",
}: GenomeConsoleProps) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Record<string, number | string>>({});

  const groups = useMemo(() => groupParameters(parameters), [parameters]);

  // Set initial active group
  React.useEffect(() => {
    if (groups.length > 0 && !activeGroup) {
      setActiveGroup(groups[0].id);
    }
  }, [groups, activeGroup]);

  const activeGroupData = groups.find((g) => g.id === activeGroup);

  const handleParameterChange = useCallback(
    (name: string, value: number | string) => {
      setPendingChanges((prev) => ({ ...prev, [name]: value }));
      onParameterChange(name, value);
    },
    [onParameterChange]
  );

  const handleApply = useCallback(() => {
    setPendingChanges({});
    onApplyChanges();
  }, [onApplyChanges]);

  return (
    <div
      className={`
        rounded-lg border border-slate/30 backdrop-blur-md overflow-hidden
        ${className}
      `}
      style={{
        background: "linear-gradient(135deg, var(--obsidian) 0%, var(--abyss) 100%)",
      }}
    >
      {/* Header */}
      <div className="px-4 py-2 border-b border-slate/30 flex items-center justify-between">
        <span className="text-sm font-medium text-primary flex items-center gap-2">
          <span>{"\u{1F9EC}"}</span>
          Genome Console
        </span>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-[10px] text-warning animate-pulse">
              Unsaved changes
            </span>
          )}
          <span className="text-[10px] text-tertiary font-mono">
            {parameters.length} params
          </span>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Exploit/Explore Dial */}
        <div className="space-y-4">
          <ExploitExploreSlider
            value={exploitExplore}
            onChange={onExploitExploreChange}
            disabled={isRunning}
            showDerivedValues={true}
          />

          {/* Quick Actions */}
          <div className="flex gap-2">
            <button
              onClick={onMutateRandom}
              disabled={isRunning}
              className="flex-1 mc-btn text-xs py-1.5"
            >
              {"\u{1F3B2}"} Random Mutation
            </button>
            <button
              onClick={handleApply}
              disabled={isRunning || !hasChanges}
              className={`
                flex-1 text-xs py-1.5 rounded border transition-colors
                ${
                  hasChanges && !isRunning
                    ? "bg-evo-mitosis/20 border-evo-mitosis text-primary hover:bg-evo-mitosis/30"
                    : "bg-void border-slate/30 text-tertiary"
                }
              `}
            >
              {"\u2714"} Apply Changes
            </button>
          </div>
        </div>

        {/* Right: Grouped Parameters */}
        <div className="space-y-3">
          {/* Group Tabs */}
          <div className="flex gap-1 flex-wrap">
            {groups.map((group) => (
              <button
                key={group.id}
                onClick={() => setActiveGroup(group.id)}
                className={`
                  px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors
                  ${
                    activeGroup === group.id
                      ? "bg-void text-primary border border-slate"
                      : "text-tertiary hover:text-secondary"
                  }
                `}
              >
                <span>{group.icon}</span>
                <span>{group.label}</span>
                <span className="text-[10px] opacity-60">
                  ({group.parameters.length})
                </span>
              </button>
            ))}
          </div>

          {/* Parameter Sliders */}
          <div className="space-y-2 max-h-36 overflow-y-auto pr-2">
            {activeGroupData?.parameters.map((param) => (
              <ParameterSlider
                key={param.name}
                param={param}
                onChange={(value) => handleParameterChange(param.name, value)}
                pendingValue={pendingChanges[param.name]}
              />
            ))}
          </div>

          {!activeGroupData && (
            <div className="text-center text-tertiary text-sm py-4">
              Select a parameter group
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GenomeConsole;
export { groupParameters };
