import React from "react";

interface GenomeParameter {
  name: string;
  value: number | string;
  min?: number;
  max?: number;
  step?: number;
  type: "number" | "string" | "enum";
  options?: string[]; // For enum type
}

interface GenomePanelProps {
  parameters: GenomeParameter[];
  onChange?: (name: string, value: number | string) => void;
  onMutateRandom?: () => void;
  onCrossover?: () => void;
  onResetToBest?: () => void;
  disabled?: boolean;
  className?: string;
}

export function GenomePanel({
  parameters,
  onChange,
  onMutateRandom,
  onCrossover,
  onResetToBest,
  disabled = false,
  className = "",
}: GenomePanelProps) {
  const handleSliderChange = (
    param: GenomeParameter,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = parseFloat(e.target.value);
    onChange?.(param.name, value);
  };

  const handleSelectChange = (
    param: GenomeParameter,
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    onChange?.(param.name, e.target.value);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Parameters */}
      <div className="space-y-3">
        {parameters.map((param) => (
          <div key={param.name} className="flex items-center gap-4">
            <label className="w-40 text-sm text-secondary font-mono truncate" title={param.name}>
              {param.name}
            </label>

            {param.type === "number" && (
              <>
                <input
                  type="range"
                  min={param.min ?? 0}
                  max={param.max ?? 1}
                  step={param.step ?? 0.01}
                  value={typeof param.value === "number" ? param.value : 0}
                  onChange={(e) => handleSliderChange(param, e)}
                  disabled={disabled}
                  className="flex-1 h-1 bg-slate rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:w-3
                    [&::-webkit-slider-thumb]:h-3
                    [&::-webkit-slider-thumb]:bg-accent-primary
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:cursor-pointer
                    disabled:opacity-50"
                />
                <span className="w-20 text-right text-sm font-mono text-primary">
                  {typeof param.value === "number" ? param.value.toFixed(2) : param.value}
                </span>
              </>
            )}

            {param.type === "enum" && param.options && (
              <select
                value={String(param.value)}
                onChange={(e) => handleSelectChange(param, e)}
                disabled={disabled}
                className="flex-1 px-3 py-1.5 bg-obsidian border border-slate rounded-md text-sm text-primary
                  disabled:opacity-50 outline-none focus:border-accent-primary"
              >
                {param.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {param.type === "string" && !param.options && (
              <span className="flex-1 text-sm text-primary font-mono">
                {param.value}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-2 border-t border-slate">
        {onMutateRandom && (
          <button
            onClick={onMutateRandom}
            disabled={disabled}
            className="mc-btn flex-1"
          >
            Mutate Random
          </button>
        )}
        {onCrossover && (
          <button
            onClick={onCrossover}
            disabled={disabled}
            className="mc-btn flex-1"
          >
            Crossover
          </button>
        )}
        {onResetToBest && (
          <button
            onClick={onResetToBest}
            disabled={disabled}
            className="mc-btn flex-1"
          >
            Reset to Best
          </button>
        )}
      </div>
    </div>
  );
}

export default GenomePanel;
