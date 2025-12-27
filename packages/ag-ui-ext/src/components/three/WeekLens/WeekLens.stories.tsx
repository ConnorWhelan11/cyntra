"use client";

import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useCallback, useState } from "react";

import type { GraphEdge, GraphNode, GraphSnapshot } from "../Graph3D/types";

import { WeekLens } from "./WeekLens";
import type { HabitTemplate, ScheduledBlock, ScheduledBlockType, WeekLensProps } from "./types";

// --- Mock Data ---

// Simple graph for ghost background
const graphNodes: GraphNode[] = [
  { id: "goal:medschool", label: "Med School", category: "Goal", weight: 0.9 },
  { id: "goal:fitness", label: "Stay Fit", category: "Goal", weight: 0.8 },
  { id: "task:orgo", label: "Orgo Review", category: "Task", weight: 0.85 },
  { id: "task:mcat", label: "MCAT Prep", category: "Task", weight: 0.8 },
  { id: "task:gym", label: "Gym", category: "Task", weight: 0.7 },
  { id: "habit:morning", label: "Morning Routine", category: "Habit", weight: 0.6 },
  { id: "habit:evening", label: "Evening Routine", category: "Habit", weight: 0.6 },
];

const graphEdges: GraphEdge[] = [
  { id: "e1", source: "goal:medschool", target: "task:orgo" },
  { id: "e2", source: "goal:medschool", target: "task:mcat" },
  { id: "e3", source: "goal:fitness", target: "task:gym" },
];

const mockGraph: GraphSnapshot = { nodes: graphNodes, edges: graphEdges };

// Helper to get Monday of current week
const getMonday = (): Date => {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
};

// Create block helper
const createBlock = (
  id: string,
  label: string,
  dayIndex: number,
  order: number,
  duration: number,
  type: ScheduledBlockType,
  nodeIds: string[] = []
): ScheduledBlock => ({
  id,
  label,
  dayIndex,
  order,
  duration,
  type,
  nodeIds,
});

// Sample schedule
const sampleSchedule: ScheduledBlock[] = [
  createBlock("b1", "Morning Routine", 0, 0, 45, "habit", ["habit:morning"]),
  createBlock("b2", "Orgo Review", 0, 1, 120, "deepWork", ["task:orgo"]),
  createBlock("b3", "Gym", 0, 2, 60, "task", ["task:gym"]),

  createBlock("b4", "Morning Routine", 1, 0, 45, "habit", ["habit:morning"]),
  createBlock("b5", "MCAT Prep", 1, 1, 90, "deepWork", ["task:mcat"]),
  createBlock("b6", "Team Meeting", 1, 2, 60, "meeting"),

  createBlock("b7", "Morning Routine", 2, 0, 45, "habit", ["habit:morning"]),
  createBlock("b8", "Deep Work", 2, 1, 120, "deepWork"),
  createBlock("b9", "Orgo Review", 2, 2, 90, "task", ["task:orgo"]),

  createBlock("b10", "Gym", 3, 0, 60, "task", ["task:gym"]),
  createBlock("b11", "Buffer", 3, 1, 30, "buffer"),

  createBlock("b12", "Portfolio Work", 4, 0, 120, "deepWork"),
  createBlock("b13", "Admin", 4, 1, 45, "task"),

  createBlock("b14", "Rest Day", 5, 0, 60, "buffer"),

  createBlock("b15", "Weekly Planning", 6, 0, 45, "task"),
  createBlock("b16", "Evening Routine", 6, 1, 30, "habit", ["habit:evening"]),
];

// Light schedule
const lightSchedule: ScheduledBlock[] = [
  createBlock("b1", "Morning Routine", 0, 0, 45, "habit"),
  createBlock("b2", "Deep Work", 2, 0, 120, "deepWork"),
  createBlock("b3", "Gym", 4, 0, 60, "task"),
];

// Empty schedule
const emptySchedule: ScheduledBlock[] = [];

// Overloaded schedule
const overloadedSchedule: ScheduledBlock[] = [
  createBlock("b1", "Morning Routine", 0, 0, 45, "habit"),
  createBlock("b2", "Deep Work 1", 0, 1, 180, "deepWork"),
  createBlock("b3", "Deep Work 2", 0, 2, 180, "deepWork"),
  createBlock("b4", "Deep Work 3", 0, 3, 180, "deepWork"),
  createBlock("b5", "Evening", 0, 4, 60, "habit"),
];

// Habit templates
const habitTemplates: HabitTemplate[] = [
  {
    id: "t1",
    label: "Morning Routine",
    totalDuration: 45,
    recurrence: "daily",
    steps: [
      { nodeId: "s1", duration: 10, label: "Journal" },
      { nodeId: "s2", duration: 15, label: "Coffee" },
      { nodeId: "s3", duration: 10, label: "Stretch" },
      { nodeId: "s4", duration: 10, label: "Plan" },
    ],
  },
  {
    id: "t2",
    label: "Evening Routine",
    totalDuration: 30,
    recurrence: "daily",
    steps: [
      { nodeId: "s5", duration: 10, label: "Review" },
      { nodeId: "s6", duration: 10, label: "Journal" },
      { nodeId: "s7", duration: 10, label: "Wind Down" },
    ],
  },
];

// --- Meta ---

const meta: Meta<typeof WeekLens> = {
  title: "Lenses/WeekLens",
  component: WeekLens,
  tags: [],
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// --- Interactive Wrapper ---

interface InteractiveWeekLensProps extends Partial<WeekLensProps> {
  initialSchedule?: ScheduledBlock[];
}

const InteractiveWeekLens: React.FC<InteractiveWeekLensProps> = ({
  initialSchedule = sampleSchedule,
  ...props
}) => {
  const [schedule, setSchedule] = useState<ScheduledBlock[]>(initialSchedule);

  const handleScheduleChange = useCallback((blocks: ScheduledBlock[]) => {
    setSchedule(blocks);
    console.log("Schedule changed:", blocks.length, "blocks");
  }, []);

  const handleDaySelect = useCallback((dayIndex: number) => {
    console.log("Day selected:", dayIndex);
    alert(`Navigating to Today for day ${dayIndex}...`);
  }, []);

  const handleGraphFocus = useCallback((nodeId: string) => {
    console.log("Graph focus:", nodeId);
    alert(`Showing ${nodeId} in Graph...`);
  }, []);

  const handleDone = useCallback(() => {
    console.log("Done planning");
    alert("Week planning complete!");
  }, []);

  return (
    <WeekLens
      graph={mockGraph}
      weekStart={getMonday()}
      habitTemplates={habitTemplates}
      existingSchedule={schedule}
      onScheduleChange={handleScheduleChange}
      onDaySelect={handleDaySelect}
      onGraphFocus={handleGraphFocus}
      onDone={handleDone}
      {...props}
    />
  );
};

// --- Stories ---

/**
 * 1. Default - Full Week
 * Standard week with blocks scheduled
 */
export const Default: Story = {
  render: () => <InteractiveWeekLens />,
  parameters: {
    docs: {
      description: {
        story: "Default week view with a full schedule across all days.",
      },
    },
  },
};

/**
 * 2. Empty Week
 * Blank canvas for planning
 */
export const EmptyWeek: Story = {
  render: () => <InteractiveWeekLens initialSchedule={emptySchedule} />,
  parameters: {
    docs: {
      description: {
        story: "Empty week - blank canvas for planning.",
      },
    },
  },
};

/**
 * 3. Light Schedule
 * Few blocks scheduled
 */
export const LightSchedule: Story = {
  render: () => <InteractiveWeekLens initialSchedule={lightSchedule} />,
  parameters: {
    docs: {
      description: {
        story: "Light schedule with only a few blocks. Glyph suggests filling empty days.",
      },
    },
  },
};

/**
 * 4. Overloaded Day
 * Monday has too many hours
 */
export const OverloadedDay: Story = {
  render: () => <InteractiveWeekLens initialSchedule={overloadedSchedule} />,
  parameters: {
    docs: {
      description: {
        story: "Monday is overloaded (10+ hours). Shows warning state.",
      },
    },
  },
};

/**
 * 5. With Goal Bias
 * Goal-biased suggestions
 */
export const WithGoalBias: Story = {
  render: () => <InteractiveWeekLens initialSchedule={lightSchedule} goalBias="goal:medschool" />,
  parameters: {
    docs: {
      description: {
        story: "Week planning with goal bias. Suggestions prioritize med school tasks.",
      },
    },
  },
};

/**
 * 6. Interactive Demo
 * Full interactive experience
 */
export const Interactive: Story = {
  render: () => <InteractiveWeekLens />,
  parameters: {
    docs: {
      description: {
        story: "Full interactive demo. Add suggestions, remove blocks, use autofill.",
      },
    },
  },
};
