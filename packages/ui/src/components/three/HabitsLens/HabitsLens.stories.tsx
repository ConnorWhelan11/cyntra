"use client";

import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useCallback, useState } from "react";

import { HabitsLens } from "./HabitsLens";
import type {
  HabitCategory,
  HabitsLensProps,
  HabitStep,
  HabitTemplate,
  RecurrenceRule,
  StreakInfo,
} from "./types";

// --- Mock Data ---

// Helper to create step
const createStep = (
  id: string,
  label: string,
  duration: number,
  optional = false
): HabitStep => ({
  id,
  label,
  duration,
  optional,
  order: 0,
});

// Helper to create template
const createTemplate = (
  id: string,
  label: string,
  category: HabitCategory,
  steps: HabitStep[],
  recurrence: RecurrenceRule = { type: "daily" }
): HabitTemplate => ({
  id,
  label,
  category,
  steps: steps.map((s, i) => ({ ...s, order: i })),
  totalDuration: steps.reduce((sum, s) => sum + s.duration, 0),
  recurrence,
  createdAt: new Date(),
  lastModified: new Date(),
});

// Helper to create streak
const createStreak = (
  templateId: string,
  current: number,
  best: number,
  hitRate: number
): StreakInfo => ({
  templateId,
  currentStreak: current,
  bestStreak: best,
  hitRate,
  lastCompleted: current > 0 ? new Date() : null,
  lastMissed: current === 0 ? new Date(Date.now() - 86400000) : null,
});

// Sample templates
const morningRoutine = createTemplate(
  "t1",
  "Morning Routine",
  "morning",
  [
    createStep("s1", "Wake", 5),
    createStep("s2", "Journal", 10),
    createStep("s3", "Coffee", 15),
    createStep("s4", "Stretch", 10, true),
    createStep("s5", "Plan", 10),
  ]
);

const eveningRoutine = createTemplate(
  "t2",
  "Evening Routine",
  "evening",
  [
    createStep("s6", "Review", 10),
    createStep("s7", "Journal", 10),
    createStep("s8", "Wind Down", 10),
  ]
);

const weeklyPlanning = createTemplate(
  "t3",
  "Weekly Planning",
  "weekly",
  [
    createStep("s9", "Review Week", 15),
    createStep("s10", "Set Goals", 15),
    createStep("s11", "Schedule", 15),
  ],
  { type: "weekly", daysOfWeek: [0] } // Sunday
);

const midweekCheckin = createTemplate(
  "t4",
  "Mid-Week Check-in",
  "weekly",
  [createStep("s12", "Check Progress", 15)],
  { type: "weekly", daysOfWeek: [3] } // Wednesday
);

const fridayDebrief = createTemplate(
  "t5",
  "Friday Debrief",
  "weekly",
  [
    createStep("s13", "Review", 15),
    createStep("s14", "Celebrate", 15),
  ],
  { type: "weekly", daysOfWeek: [5] } // Friday
);

const gymRoutine = createTemplate(
  "t6",
  "Gym Routine",
  "custom",
  [
    createStep("s15", "Warmup", 10),
    createStep("s16", "Workout", 45),
    createStep("s17", "Cooldown", 10, true),
  ],
  { type: "custom", daysOfWeek: [1, 3, 5] } // MWF
);

// Sample templates
const sampleTemplates: HabitTemplate[] = [
  morningRoutine,
  eveningRoutine,
  weeklyPlanning,
  midweekCheckin,
  fridayDebrief,
  gymRoutine,
];

// Sample streaks
const sampleStreaks = new Map<string, StreakInfo>([
  ["t1", createStreak("t1", 12, 21, 0.85)],
  ["t2", createStreak("t2", 5, 14, 0.72)],
  ["t3", createStreak("t3", 8, 12, 0.9)],
  ["t6", createStreak("t6", 3, 8, 0.65)],
]);

// Broken streak
const brokenStreaks = new Map<string, StreakInfo>([
  ["t1", createStreak("t1", 0, 21, 0.6)],
  ["t2", createStreak("t2", 0, 14, 0.4)],
]);

// Strong streaks
const strongStreaks = new Map<string, StreakInfo>([
  ["t1", createStreak("t1", 30, 45, 0.95)],
  ["t2", createStreak("t2", 21, 28, 0.9)],
]);

// Minimal templates (just morning)
const minimalTemplates: HabitTemplate[] = [morningRoutine];

// Empty templates
const emptyTemplates: HabitTemplate[] = [];

// --- Meta ---

const meta: Meta<typeof HabitsLens> = {
  title: "Lenses/HabitsLens",
  component: HabitsLens,
  tags: [],
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// --- Interactive Wrapper ---

interface InteractiveHabitsLensProps extends Partial<HabitsLensProps> {
  initialTemplates?: HabitTemplate[];
  initialStreaks?: Map<string, StreakInfo>;
}

const InteractiveHabitsLens: React.FC<InteractiveHabitsLensProps> = ({
  initialTemplates = sampleTemplates,
  initialStreaks = sampleStreaks,
  ...props
}) => {
  const [templates, setTemplates] = useState<HabitTemplate[]>(initialTemplates);

  const handleTemplateDelete = useCallback((templateId: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    console.log("Deleted template:", templateId);
  }, []);

  const handleAddToWeek = useCallback((templateId: string) => {
    console.log("Add to week:", templateId);
    alert(`Adding ${templateId} to Week...`);
  }, []);

  const handleStartNow = useCallback((templateId: string) => {
    console.log("Start now:", templateId);
    alert(`Starting ${templateId} in Stack...`);
  }, []);

  return (
    <HabitsLens
      templates={templates}
      streakData={initialStreaks}
      currentDate={new Date()}
      onTemplateDelete={handleTemplateDelete}
      onAddToWeek={handleAddToWeek}
      onStartNow={handleStartNow}
      {...props}
    />
  );
};

// --- Stories ---

/**
 * 1. Default - Full Setup
 * All habit categories with streaks
 */
export const Default: Story = {
  render: () => <InteractiveHabitsLens />,
  parameters: {
    docs: {
      description: {
        story:
          "Full habits setup with morning, evening, weekly anchors, and custom routines.",
      },
    },
  },
};

/**
 * 2. Empty State
 * No habits created yet
 */
export const EmptyState: Story = {
  render: () => <InteractiveHabitsLens initialTemplates={emptyTemplates} />,
  parameters: {
    docs: {
      description: {
        story: "Empty state - prompts user to create their first routine.",
      },
    },
  },
};

/**
 * 3. Minimal - Just Morning
 * Only morning routine
 */
export const MinimalSetup: Story = {
  render: () => (
    <InteractiveHabitsLens
      initialTemplates={minimalTemplates}
      initialStreaks={new Map([["t1", createStreak("t1", 7, 14, 0.8)]])}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Minimal setup with only a morning routine.",
      },
    },
  },
};

/**
 * 4. Broken Streaks
 * Some streaks are broken
 */
export const BrokenStreaks: Story = {
  render: () => (
    <InteractiveHabitsLens
      initialTemplates={[morningRoutine, eveningRoutine]}
      initialStreaks={brokenStreaks}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Broken streaks - Glyph offers to help simplify routines.",
      },
    },
  },
};

/**
 * 5. Strong Streaks
 * Long-running streaks
 */
export const StrongStreaks: Story = {
  render: () => (
    <InteractiveHabitsLens
      initialTemplates={[morningRoutine, eveningRoutine]}
      initialStreaks={strongStreaks}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Strong streaks - 30+ day morning routine, 21 day evening.",
      },
    },
  },
};

/**
 * 6. Weekly Only
 * Only weekly anchors
 */
export const WeeklyOnly: Story = {
  render: () => (
    <InteractiveHabitsLens
      initialTemplates={[weeklyPlanning, midweekCheckin, fridayDebrief]}
      initialStreaks={new Map()}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Only weekly anchor habits - planning, check-in, debrief.",
      },
    },
  },
};

/**
 * 7. Interactive Demo
 * Full interactive experience
 */
export const Interactive: Story = {
  render: () => <InteractiveHabitsLens />,
  parameters: {
    docs: {
      description: {
        story:
          "Full interactive demo. Expand templates, see streaks, delete habits.",
      },
    },
  },
};

