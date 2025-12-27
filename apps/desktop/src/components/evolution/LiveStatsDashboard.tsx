/**
 * LiveStatsDashboard - Real-time evolution statistics panel
 * Displays organic gauges for mutation rate, convergence, diversity, and speed
 */

import React from "react";
import type { EvolutionStats } from "@/types";
import { StatGauge } from "./StatGauge";

interface LiveStatsDashboardProps {
  stats: EvolutionStats;
  isRunning: boolean;
  className?: string;
}

export function LiveStatsDashboard({ stats, isRunning, className = "" }: LiveStatsDashboardProps) {
  return (
    <div className={`mc-panel ${className}`}>
      <div className="mc-panel-header">
        <span className="mc-panel-title">Live Stats</span>
        <div className="mc-panel-actions">
          {isRunning ? (
            <span className="flex items-center gap-1.5 text-xs text-active">
              <span className="w-1.5 h-1.5 rounded-full bg-active animate-pulse" />
              Evolving
            </span>
          ) : (
            <span className="text-xs text-tertiary">Idle</span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Primary gauges - 2x2 grid */}
        <div className="grid grid-cols-2 gap-4 justify-items-center">
          <StatGauge
            value={stats.mutationRate}
            max={1}
            label="Mutation"
            unit="%"
            isActive={isRunning}
            colorScheme="rate"
            size="md"
            trend={isRunning ? "stable" : undefined}
          />
          <StatGauge
            value={stats.diversityIndex}
            max={1}
            label="Diversity"
            unit=""
            isActive={isRunning}
            colorScheme="diversity"
            size="md"
            trend={stats.diversityIndex > 0.5 ? "up" : "down"}
          />
          <StatGauge
            value={stats.convergenceSpeed}
            max={30}
            label="Converge"
            unit="gen"
            isActive={isRunning}
            colorScheme="speed"
            size="md"
          />
          <StatGauge
            value={stats.generationSpeed}
            max={10}
            label="Speed"
            unit="/min"
            isActive={isRunning}
            colorScheme="speed"
            size="md"
            trend={isRunning && stats.generationSpeed > 2 ? "up" : undefined}
          />
        </div>

        {/* Secondary stats - compact list */}
        <div className="border-t border-slate pt-3 space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-secondary">Best Fitness</span>
            <span className="font-mono text-evo-high">{stats.bestFitness.toFixed(3)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-secondary">Avg Fitness</span>
            <span className="font-mono text-primary">{stats.averageFitness.toFixed(3)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-secondary">Elite Count</span>
            <span className="font-mono text-evo-frontier">{stats.eliteCount}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-secondary">Generations</span>
            <span className="font-mono text-primary">{stats.totalGenerations}</span>
          </div>
        </div>

        {/* Fitness bar visualization */}
        <div className="pt-2">
          <div className="flex justify-between text-xs text-tertiary mb-1">
            <span>Population Fitness Distribution</span>
          </div>
          <div className="h-2 bg-void rounded-full overflow-hidden flex">
            {/* Low fitness segment */}
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${(1 - stats.averageFitness) * 50}%`,
                background: "var(--evo-low)",
                opacity: 0.7,
              }}
            />
            {/* Mid fitness segment */}
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${stats.diversityIndex * 30}%`,
                background: "var(--evo-mid)",
                opacity: 0.8,
              }}
            />
            {/* High fitness segment */}
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${stats.averageFitness * 50}%`,
                background: "var(--evo-high)",
                opacity: 0.9,
              }}
            />
            {/* Elite segment */}
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${(stats.eliteCount / 20) * 20}%`,
                background: "var(--evo-frontier)",
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-tertiary mt-1">
            <span>0</span>
            <span>Fitness</span>
            <span>1</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiveStatsDashboard;
