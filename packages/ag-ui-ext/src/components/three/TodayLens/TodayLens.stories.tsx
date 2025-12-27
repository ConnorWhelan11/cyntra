"use client";

import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useState, useCallback, useEffect } from "react";

import { TodayLens } from "./TodayLens";
import type { TodayLensProps, TodayBlock, TodayViewMode, BlockStatus } from "./types";
import type { GraphSnapshot, GraphNode, GraphEdge } from "../Graph3D/types";

// --- Mock Data ---

// Create a simple context graph
const contextNodes: GraphNode[] = [
  { id: "now", label: "NOW", category: "Mission", weight: 1.0 },
  { id: "goal-school", label: "Med School", category: "Goal", weight: 0.9 },
  { id: "goal-health", label: "Stay Fit", category: "Goal", weight: 0.8 },
  { id: "orgo", label: "Orgo Review", category: "School", weight: 0.85 },
  { id: "gym", label: "Gym", category: "Health", weight: 0.7 },
  { id: "project", label: "Project Work", category: "Work", weight: 0.75 },
];

const contextEdges: GraphEdge[] = [
  { id: "e1", source: "now", target: "orgo" },
  { id: "e2", source: "now", target: "gym" },
  { id: "e3", source: "now", target: "project" },
  { id: "e4", source: "goal-school", target: "orgo" },
  { id: "e5", source: "goal-health", target: "gym" },
];

const contextGraph: GraphSnapshot = {
  nodes: contextNodes,
  edges: contextEdges,
};

// Helper to create a time today
const timeToday = (hour: number, minute: number = 0): Date => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
};

// Sample blocks for a productive day
const sampleBlocks: TodayBlock[] = [
  {
    id: "block-1",
    nodeIds: ["morning-routine"],
    label: "Morning Routine",
    description: "Journal → Coffee → Stretch",
    scheduledStart: timeToday(6, 30),
    duration: 45,
    status: "done",
    type: "habit",
  },
  {
    id: "block-2",
    nodeIds: ["orgo"],
    label: "Deep Work: Orgo Review",
    description: "Chapter 12, Practice Problems",
    scheduledStart: timeToday(8, 0),
    duration: 90,
    status: "active",
    type: "deepWork",
  },
  {
    id: "block-3",
    nodeIds: ["break"],
    label: "Break",
    scheduledStart: timeToday(9, 30),
    duration: 15,
    status: "planned",
    type: "buffer",
  },
  {
    id: "block-4",
    nodeIds: ["gym"],
    label: "Gym",
    description: "Legs day",
    scheduledStart: timeToday(9, 45),
    duration: 60,
    status: "planned",
    type: "task",
  },
  {
    id: "block-5",
    nodeIds: ["lunch"],
    label: "Lunch + Admin",
    scheduledStart: timeToday(11, 0),
    duration: 75,
    status: "planned",
    type: "buffer",
  },
  {
    id: "block-6",
    nodeIds: ["project"],
    label: "Project Work",
    description: "Frontend polish",
    scheduledStart: timeToday(12, 30),
    duration: 120,
    status: "planned",
    type: "deepWork",
  },
  {
    id: "block-7",
    nodeIds: ["reading"],
    label: "Reading",
    scheduledStart: timeToday(15, 0),
    duration: 45,
    status: "planned",
    type: "task",
  },
  {
    id: "block-8",
    nodeIds: ["evening-routine"],
    label: "Evening Routine",
    description: "Review → Journal → Wind Down",
    scheduledStart: timeToday(18, 0),
    duration: 30,
    status: "planned",
    type: "habit",
  },
];

// Blocks for empty day scenario
const emptyDayBlocks: TodayBlock[] = [];

// Blocks for completed day
const completedDayBlocks: TodayBlock[] = sampleBlocks.map((b) => ({
  ...b,
  status: "done" as BlockStatus,
}));

// Blocks with some skipped
const mixedStatusBlocks: TodayBlock[] = [
  { ...sampleBlocks[0], status: "done" },
  { ...sampleBlocks[1], status: "done" },
  { ...sampleBlocks[2], status: "done" },
  { ...sampleBlocks[3], status: "skipped" },
  { ...sampleBlocks[4], status: "done" },
  { ...sampleBlocks[5], status: "deferred" },
  { ...sampleBlocks[6], status: "planned" },
  { ...sampleBlocks[7], status: "planned" },
];

// Short day (3 blocks)
const shortDayBlocks: TodayBlock[] = sampleBlocks.slice(0, 3);

// --- Meta ---

const meta: Meta<typeof TodayLens> = {
  title: "Lenses/TodayLens",
  component: TodayLens,
  tags: [],
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    viewMode: {
      control: "select",
      options: ["timeline", "ring"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// --- Interactive Wrapper ---

interface InteractiveTodayLensProps extends Partial<TodayLensProps> {
  initialBlocks?: TodayBlock[];
  simulateTime?: boolean;
}

const InteractiveTodayLens: React.FC<InteractiveTodayLensProps> = ({
  initialBlocks = sampleBlocks,
  simulateTime = false,
  ...props
}) => {
  const [blocks, setBlocks] = useState<TodayBlock[]>(initialBlocks);
  const [viewMode, setViewMode] = useState<TodayViewMode>(props.viewMode ?? "timeline");
  const [currentTime, setCurrentTime] = useState(new Date());

  // Simulate time passing
  useEffect(() => {
    if (!simulateTime) return;
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [simulateTime]);

  const handleBlockTap = useCallback((blockId: string) => {
    console.log("Block tapped:", blockId);
  }, []);

  const handleBlockStatusChange = useCallback((blockId: string, status: BlockStatus) => {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, status } : b)));
  }, []);

  const handleViewModeChange = useCallback((mode: TodayViewMode) => {
    setViewMode(mode);
  }, []);

  const handleEndDay = useCallback(() => {
    console.log("End day triggered");
    alert("Opening Debrief...");
  }, []);

  const handleZoomOut = useCallback(() => {
    console.log("Zoom out to Week");
    alert("Navigating to Week view...");
  }, []);

  return (
    <TodayLens
      graph={contextGraph}
      date={new Date()}
      blocks={blocks}
      viewMode={viewMode}
      currentTime={currentTime}
      onBlockTap={handleBlockTap}
      onBlockStatusChange={handleBlockStatusChange}
      onViewModeChange={handleViewModeChange}
      onEndDay={handleEndDay}
      onZoomOut={handleZoomOut}
      {...props}
    />
  );
};

// --- Stories ---

/**
 * 1. Timeline View (Default)
 * Standard day timeline with blocks
 */
export const TimelineView: Story = {
  render: () => <InteractiveTodayLens viewMode="timeline" currentTime={timeToday(8, 30)} />,
  parameters: {
    docs: {
      description: {
        story:
          "Default timeline view showing the day's blocks. The active block is highlighted with a cyan glow.",
      },
    },
  },
};

/**
 * 2. Ring View
 * Mission ring visualization of the day
 */
export const RingView: Story = {
  render: () => <InteractiveTodayLens viewMode="ring" currentTime={timeToday(8, 30)} />,
  parameters: {
    docs: {
      description: {
        story:
          "Ring view showing blocks as connected nodes in a circular layout, representing the day as a mission loop.",
      },
    },
  },
};

/**
 * 3. Morning Startup
 * Early morning before first block starts
 */
export const MorningStartup: Story = {
  render: () => <InteractiveTodayLens viewMode="timeline" currentTime={timeToday(6, 0)} />,
  parameters: {
    docs: {
      description: {
        story: "Morning view before the day starts. Glyph greets the user and shows the day ahead.",
      },
    },
  },
};

/**
 * 4. Mid-Day Progress
 * Afternoon with some blocks completed
 */
export const MidDayProgress: Story = {
  render: () => (
    <InteractiveTodayLens
      initialBlocks={mixedStatusBlocks}
      viewMode="timeline"
      currentTime={timeToday(14, 30)}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Mid-day view showing mixed progress: some done, one skipped, one deferred.",
      },
    },
  },
};

/**
 * 5. Day Complete
 * All blocks finished
 */
export const DayComplete: Story = {
  render: () => (
    <InteractiveTodayLens
      initialBlocks={completedDayBlocks}
      viewMode="timeline"
      currentTime={timeToday(19, 0)}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Day complete! All blocks are done. Glyph celebrates and prompts for Debrief.",
      },
    },
  },
};

/**
 * 6. Empty Day
 * No blocks scheduled
 */
export const EmptyDay: Story = {
  render: () => (
    <InteractiveTodayLens
      initialBlocks={emptyDayBlocks}
      viewMode="timeline"
      currentTime={timeToday(9, 0)}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Empty day with no blocks. Shows empty state prompting user to plan.",
      },
    },
  },
};

/**
 * 7. Short Day (Few Blocks)
 * Light day with only 3 blocks
 */
export const ShortDay: Story = {
  render: () => (
    <InteractiveTodayLens
      initialBlocks={shortDayBlocks}
      viewMode="timeline"
      currentTime={timeToday(7, 30)}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Light day with only 3 blocks scheduled.",
      },
    },
  },
};

/**
 * 8. Ring View - Short Day
 * Ring view with few blocks
 */
export const RingViewShort: Story = {
  render: () => (
    <InteractiveTodayLens
      initialBlocks={shortDayBlocks}
      viewMode="ring"
      currentTime={timeToday(7, 30)}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Ring view with only 3 blocks, showing how the ring adapts to fewer nodes.",
      },
    },
  },
};

/**
 * 9. Interactive Demo
 * Full interactive experience
 */
export const Interactive: Story = {
  render: () => <InteractiveTodayLens simulateTime={false} />,
  parameters: {
    docs: {
      description: {
        story: "Full interactive demo. Click blocks, toggle views, and explore the Today lens.",
      },
    },
  },
};

/**
 * 10. Real Time
 * Uses actual current time
 */
export const RealTime: Story = {
  render: () => <InteractiveTodayLens simulateTime={true} />,
  parameters: {
    docs: {
      description: {
        story: "Real-time view using the actual current time. The Now marker updates every minute.",
      },
    },
  },
};
