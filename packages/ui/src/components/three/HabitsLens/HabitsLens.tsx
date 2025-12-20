"use client";

import React, { useCallback, useMemo, useState } from "react";

import { cn } from "../../../lib/utils";

import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  formatHitRate,
  getHabitsGlyphContext,
  getStreakEmoji,
  type HabitCategory,
  type HabitsLensProps,
  type HabitStep,
  type HabitTemplate,
  type StreakInfo,
} from "./types";

/**
 * Step Circle Component
 */
interface StepCircleProps {
  step: HabitStep;
  status?: "pending" | "done" | "missed";
  isFirst?: boolean;
  isLast?: boolean;
}

const StepCircle: React.FC<StepCircleProps> = ({
  step,
  status = "pending",
}) => {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center",
          "border-2 transition-all",
          status === "done"
            ? "bg-green-500/30 border-green-400 text-green-300"
            : status === "missed"
              ? "bg-red-500/30 border-red-400 text-red-300"
              : step.optional
                ? "bg-white/5 border-dashed border-white/20 text-white/40"
                : "bg-white/5 border-white/20 text-white/60"
        )}
      >
        {status === "done" ? "✓" : status === "missed" ? "×" : "○"}
      </div>
      <span className="text-[10px] text-white/50 text-center max-w-16 truncate">
        {step.label}
      </span>
      <span className="text-[9px] text-white/30">{step.duration}m</span>
    </div>
  );
};

/**
 * Orbit Visualization
 */
interface OrbitVisualizationProps {
  steps: HabitStep[];
  category: HabitCategory;
}

const OrbitVisualization: React.FC<OrbitVisualizationProps> = ({
  steps,
  category,
}) => {
  const colors = CATEGORY_COLORS[category];

  return (
    <div className={cn("p-4 rounded-xl bg-gradient-to-br", colors.gradient)}>
      <div className="flex items-center justify-center gap-2 overflow-x-auto py-2">
        {steps.map((step, i) => (
          <React.Fragment key={step.id}>
            <StepCircle
              step={step}
              isFirst={i === 0}
              isLast={i === steps.length - 1}
            />
            {i < steps.length - 1 && (
              <div className="w-4 h-px bg-white/20 shrink-0" />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

/**
 * Streak Counter Component
 */
interface StreakCounterProps {
  streak: StreakInfo;
}

const StreakCounter: React.FC<StreakCounterProps> = ({ streak }) => {
  const emoji = getStreakEmoji(streak.currentStreak);

  return (
    <div className="flex items-center gap-4 text-sm">
      {streak.currentStreak > 0 && (
        <span className="text-amber-400">
          {emoji} {streak.currentStreak} days
        </span>
      )}
      {streak.bestStreak > 0 && (
        <span className="text-white/40">
          Best: {streak.bestStreak}
        </span>
      )}
      <span className="text-white/40">
        Hit rate: {formatHitRate(streak.hitRate)}
      </span>
    </div>
  );
};

/**
 * Orbit Section - One habit template card
 */
interface OrbitSectionProps {
  template: HabitTemplate;
  streak?: StreakInfo;
  onEdit?: () => void;
  onAddToWeek?: () => void;
  onStartNow?: () => void;
  onDelete?: () => void;
}

const OrbitSection: React.FC<OrbitSectionProps> = ({
  template,
  streak,
  onEdit,
  onAddToWeek,
  onStartNow,
  onDelete,
}) => {
  const [expanded, setExpanded] = useState(false);
  const colors = CATEGORY_COLORS[template.category];
  const icon = CATEGORY_ICONS[template.category];

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden",
        colors.border,
        "bg-black/30"
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full px-4 py-3 flex items-center gap-3",
          "hover:bg-white/5 transition-colors text-left"
        )}
      >
        <span className="text-xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className={cn("font-medium", colors.text)}>{template.label}</div>
          <div className="text-xs text-white/40">
            {template.steps.length} steps · {template.totalDuration} min
          </div>
        </div>
        <span
          className={cn(
            "text-white/30 transition-transform",
            expanded && "rotate-180"
          )}
        >
          ▼
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Orbit visualization */}
          <OrbitVisualization steps={template.steps} category={template.category} />

          {/* Streak info */}
          {streak && <StreakCounter streak={streak} />}

          {/* Divider */}
          <div className="border-t border-white/10" />

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium",
                "bg-white/5 border border-white/10 text-white/60",
                "hover:bg-white/10 hover:text-white/80",
                "transition-all"
              )}
            >
              Edit
            </button>
            <button
              onClick={onAddToWeek}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium",
                colors.bg,
                colors.border,
                colors.text,
                "hover:opacity-80",
                "transition-all"
              )}
            >
              Add to Week
            </button>
            <button
              onClick={onStartNow}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium",
                "bg-cyan-500/20 border border-cyan-400/30 text-cyan-200",
                "hover:bg-cyan-500/30",
                "transition-all"
              )}
            >
              Start now
            </button>
            <button
              onClick={onDelete}
              className="ml-auto text-red-400/60 hover:text-red-400 text-xs"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Weekly Anchor Card
 */
interface WeeklyAnchorCardProps {
  template: HabitTemplate;
  onClick?: () => void;
}

const WeeklyAnchorCard: React.FC<WeeklyAnchorCardProps> = ({
  template,
  onClick,
}) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-3 rounded-lg border bg-slate-500/10 border-slate-400/20",
        "hover:bg-slate-500/20 transition-all text-left"
      )}
    >
      <div className="text-xs text-white/40 mb-1">
        {template.recurrence.daysOfWeek?.[0] === 0
          ? "Sunday"
          : template.recurrence.daysOfWeek?.[0] === 3
            ? "Wednesday"
            : "Friday"}
      </div>
      <div className="text-sm font-medium text-white/80">{template.label}</div>
      <div className="text-xs text-white/40">{template.totalDuration}m</div>
    </button>
  );
};

/**
 * HabitsLens - Habits & Rituals Management
 *
 * Core Question: "What should my days reliably start / end / orbit around?"
 */
export const HabitsLens: React.FC<HabitsLensProps> = ({
  templates,
  instances: _instances,
  streakData,
  currentDate: _currentDate,
  className,
  onTemplateCreate: _onTemplateCreate,
  onTemplateEdit,
  onTemplateDelete,
  onAddToWeek,
  onStartNow,
  onViewInGraph: _onViewInGraph,
}) => {
  // Silence unused
  void _instances;
  void _currentDate;
  void _onTemplateCreate;
  void _onViewInGraph;

  // Group templates by category
  const morningTemplates = useMemo(
    () => templates.filter((t) => t.category === "morning"),
    [templates]
  );
  const eveningTemplates = useMemo(
    () => templates.filter((t) => t.category === "evening"),
    [templates]
  );
  const weeklyTemplates = useMemo(
    () => templates.filter((t) => t.category === "weekly"),
    [templates]
  );
  const customTemplates = useMemo(
    () => templates.filter((t) => t.category === "custom"),
    [templates]
  );

  // Get Glyph context
  const glyphContext = useMemo(
    () => getHabitsGlyphContext(templates, streakData),
    [templates, streakData]
  );

  // Handlers
  const handleEdit = useCallback(
    (templateId: string) => {
      console.log("Edit template:", templateId);
      onTemplateEdit?.(templateId, {});
    },
    [onTemplateEdit]
  );

  const handleAddToWeek = useCallback(
    (templateId: string) => {
      console.log("Add to week:", templateId);
      onAddToWeek?.(templateId, new Date());
    },
    [onAddToWeek]
  );

  const handleStartNow = useCallback(
    (templateId: string) => {
      console.log("Start now:", templateId);
      onStartNow?.(templateId);
    },
    [onStartNow]
  );

  const handleDelete = useCallback(
    (templateId: string) => {
      console.log("Delete template:", templateId);
      onTemplateDelete?.(templateId);
    },
    [onTemplateDelete]
  );

  // Render section helper
  const renderSection = (
    title: string,
    icon: string,
    sectionTemplates: HabitTemplate[]
  ) => {
    if (sectionTemplates.length === 0) return null;

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-sm font-medium text-white/70">{title}</span>
        </div>
        <div className="space-y-2">
          {sectionTemplates.map((template) => (
            <OrbitSection
              key={template.id}
              template={template}
              streak={streakData?.get(template.id)}
              onEdit={() => handleEdit(template.id)}
              onAddToWeek={() => handleAddToWeek(template.id)}
              onStartNow={() => handleStartNow(template.id)}
              onDelete={() => handleDelete(template.id)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "relative w-full h-[600px] rounded-2xl border border-white/10",
        "bg-gradient-to-br from-[#020312] via-black to-[#050818] overflow-hidden",
        "flex flex-col",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white/90">
            Habits & Rituals
          </span>
          <span className="text-xs text-white/40">
            {templates.length} templates
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium",
              "bg-cyan-500/20 border border-cyan-400/30 text-cyan-200",
              "hover:bg-cyan-500/30",
              "transition-all"
            )}
          >
            + New
          </button>
          <button
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium",
              "bg-purple-500/20 border border-purple-400/30 text-purple-200",
              "hover:bg-purple-500/30",
              "transition-all"
            )}
          >
            Wizard
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* Morning Orbit */}
        {renderSection("Morning Orbit", "☀️", morningTemplates)}

        {/* Evening Orbit */}
        {renderSection("Evening Orbit", "🌙", eveningTemplates)}

        {/* Custom */}
        {renderSection("Custom Rituals", "⭐", customTemplates)}

        {/* Weekly Anchors */}
        {weeklyTemplates.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚓</span>
              <span className="text-sm font-medium text-white/70">
                Weekly Anchors
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {weeklyTemplates.map((template) => (
                <WeeklyAnchorCard
                  key={template.id}
                  template={template}
                  onClick={() => handleStartNow(template.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {templates.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="text-4xl mb-4">🌅</div>
            <div className="text-white/60 mb-2">No rituals yet</div>
            <div className="text-sm text-white/40 mb-4">
              Start with a morning routine to anchor your days.
            </div>
            <button
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium",
                "bg-amber-500/20 border border-amber-400/30 text-amber-200",
                "hover:bg-amber-500/30",
                "transition-all"
              )}
            >
              Create Morning Routine
            </button>
          </div>
        )}
      </div>

      {/* Bottom Bar - Glyph */}
      <div className="px-6 py-4 border-t border-white/5">
        <div className="flex items-center justify-between">
          <div className="px-4 py-2 rounded-full bg-black/60 border border-white/10">
            <span className="text-sm font-mono text-cyan-200">
              "{glyphContext.dialogue}"
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HabitsLens;

