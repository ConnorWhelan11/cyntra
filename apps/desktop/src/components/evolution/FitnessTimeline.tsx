import React, { useMemo } from "react";

interface FitnessPoint {
  generation: number;
  fitness: number;
}

interface FitnessTimelineProps {
  data: FitnessPoint[];
  currentGeneration?: number;
  height?: number;
  className?: string;
}

export function FitnessTimeline({
  data,
  currentGeneration,
  height = 200,
  className = "",
}: FitnessTimelineProps) {
  // Calculate chart dimensions and path
  const chartData = useMemo(() => {
    if (data.length === 0) return null;

    const padding = { top: 20, right: 40, bottom: 30, left: 50 };
    const width = 600; // Will be responsive via viewBox

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Find data range
    const minGen = Math.min(...data.map((d) => d.generation));
    const maxGen = Math.max(...data.map((d) => d.generation));
    const maxFit = Math.max(...data.map((d) => d.fitness), 1);

    // Scale functions
    const scaleX = (gen: number) =>
      padding.left + ((gen - minGen) / (maxGen - minGen || 1)) * chartWidth;
    const scaleY = (fit: number) => padding.top + chartHeight - (fit / maxFit) * chartHeight;

    // Generate path
    const sortedData = [...data].sort((a, b) => a.generation - b.generation);
    const pathPoints = sortedData.map((d) => `${scaleX(d.generation)},${scaleY(d.fitness)}`);
    const linePath = `M ${pathPoints.join(" L ")}`;

    // Area fill path
    const areaPath = `${linePath} L ${scaleX(maxGen)},${scaleY(0)} L ${scaleX(minGen)},${scaleY(0)} Z`;

    // Current generation marker position
    const currentX = currentGeneration !== undefined ? scaleX(currentGeneration) : null;

    // Y-axis labels
    const yLabels = [0, 0.25, 0.5, 0.75, 1].map((v) => ({
      value: (v * maxFit).toFixed(2),
      y: scaleY(v * maxFit),
    }));

    // X-axis labels (show ~5 evenly spaced)
    const xLabels = [];
    const step = Math.ceil((maxGen - minGen) / 5) || 1;
    for (let gen = minGen; gen <= maxGen; gen += step) {
      xLabels.push({
        value: gen,
        x: scaleX(gen),
      });
    }

    return {
      width,
      height,
      padding,
      chartWidth,
      chartHeight,
      linePath,
      areaPath,
      currentX,
      yLabels,
      xLabels,
    };
  }, [data, height, currentGeneration]);

  if (!chartData || data.length === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height }}>
        <span className="text-tertiary text-sm">No fitness data available</span>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <svg
        viewBox={`0 0 ${chartData.width} ${chartData.height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Fitness timeline chart"
      >
        {/* Grid lines */}
        <g className="text-slate" stroke="currentColor" strokeWidth="1" opacity="0.3">
          {chartData.yLabels.map((label, i) => (
            <line
              key={i}
              x1={chartData.padding.left}
              y1={label.y}
              x2={chartData.width - chartData.padding.right}
              y2={label.y}
            />
          ))}
        </g>

        {/* Area fill */}
        <path d={chartData.areaPath} fill="url(#fitness-gradient)" opacity="0.3" />

        {/* Line */}
        <path
          d={chartData.linePath}
          fill="none"
          stroke="var(--evo-high)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Current generation marker */}
        {chartData.currentX !== null && (
          <line
            x1={chartData.currentX}
            y1={chartData.padding.top}
            x2={chartData.currentX}
            y2={chartData.height - chartData.padding.bottom}
            stroke="var(--accent-primary)"
            strokeWidth="2"
            strokeDasharray="4 2"
          />
        )}

        {/* Y-axis labels */}
        <g className="text-tertiary" fontSize="10" fontFamily="var(--font-mono)">
          {chartData.yLabels.map((label, i) => (
            <text
              key={i}
              x={chartData.padding.left - 8}
              y={label.y + 3}
              textAnchor="end"
              fill="currentColor"
            >
              {label.value}
            </text>
          ))}
        </g>

        {/* X-axis labels */}
        <g className="text-tertiary" fontSize="10" fontFamily="var(--font-mono)">
          {chartData.xLabels.map((label, i) => (
            <text
              key={i}
              x={label.x}
              y={chartData.height - chartData.padding.bottom + 16}
              textAnchor="middle"
              fill="currentColor"
            >
              {label.value}
            </text>
          ))}
          <text
            x={chartData.width / 2}
            y={chartData.height - 4}
            textAnchor="middle"
            fill="currentColor"
            fontSize="11"
          >
            Generation
          </text>
        </g>

        {/* Gradient definition */}
        <defs>
          <linearGradient id="fitness-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--evo-high)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--evo-high)" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export default FitnessTimeline;
