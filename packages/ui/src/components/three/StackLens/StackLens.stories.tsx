"use client";

import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useCallback, useState } from "react";

import { StackLens } from "./StackLens";
import type {
  EnforcementState,
  StackLensProps,
  StackTask,
  TaskStatus,
} from "./types";

// --- Mock Data ---

const createTask = (
  id: string,
  label: string,
  description: string,
  duration: number,
  status: TaskStatus = "pending"
): StackTask => ({
  id,
  nodeId: `node:${id}`,
  label,
  description,
  plannedDuration: duration,
  status,
});

const sampleTasks: StackTask[] = [
  createTask(
    "task-1",
    "Orgo Review",
    "Chapter 12, Practice Problems",
    45,
    "pending"
  ),
  createTask(
    "task-2",
    "Practice Problems Set 3",
    "Finish remaining 10 problems",
    30,
    "pending"
  ),
  createTask(
    "task-3",
    "Review Chapter 11",
    "Quick review if time permits",
    20,
    "pending"
  ),
];

const activeTaskStack: StackTask[] = [
  { ...sampleTasks[0], status: "active", startedAt: new Date() },
  sampleTasks[1],
  sampleTasks[2],
];

const singleTaskStack: StackTask[] = [sampleTasks[0]];

const completedStack: StackTask[] = [
  { ...sampleTasks[0], status: "done", completedAt: new Date() },
  { ...sampleTasks[1], status: "done", completedAt: new Date() },
  { ...sampleTasks[2], status: "skipped" },
];

const mockEnforcement: EnforcementState = {
  active: true,
  suppressedNodeIds: ["distraction:youtube", "distraction:twitter"],
  suppressedSites: ["youtube.com", "twitter.com", "reddit.com"],
  endsAt: new Date(Date.now() + 25 * 60 * 1000), // 25 minutes from now
};

// --- Meta ---

const meta: Meta<typeof StackLens> = {
  title: "Lenses/StackLens",
  component: StackLens,
  tags: [],
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// --- Interactive Wrapper ---

interface InteractiveStackLensProps extends Partial<StackLensProps> {
  initialTasks?: StackTask[];
}

const InteractiveStackLens: React.FC<InteractiveStackLensProps> = ({
  initialTasks = sampleTasks,
  ...props
}) => {
  const [tasks, setTasks] = useState<StackTask[]>(initialTasks);

  const handleTaskStart = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: "active" as TaskStatus, startedAt: new Date() }
          : t
      )
    );
    console.log("Task started:", taskId);
  }, []);

  const handleTaskComplete = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: "done" as TaskStatus, completedAt: new Date() }
          : t
      )
    );
    console.log("Task completed:", taskId);
  }, []);

  const handleTaskSkip = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: "skipped" as TaskStatus } : t
      )
    );
    console.log("Task skipped:", taskId);
  }, []);

  const handleBlockComplete = useCallback(() => {
    console.log("Block complete - triggering Debrief");
    alert("Block complete! Opening Debrief...");
  }, []);

  const handleDistractionTrigger = useCallback(() => {
    console.log("Distraction triggered - opening Leaks");
    alert("Opening Leaks lens...");
  }, []);

  const handleZoomOut = useCallback(() => {
    console.log("Zoom out to Today");
    alert("Navigating to Today...");
  }, []);

  return (
    <StackLens
      blockId="block-1"
      blockLabel="Deep Work: Orgo"
      tasks={tasks}
      onTaskStart={handleTaskStart}
      onTaskComplete={handleTaskComplete}
      onTaskSkip={handleTaskSkip}
      onBlockComplete={handleBlockComplete}
      onDistractionTrigger={handleDistractionTrigger}
      onZoomOut={handleZoomOut}
      {...props}
    />
  );
};

// --- Stories ---

/**
 * 1. Default - Ready to Start
 * Stack with tasks ready to begin
 */
export const Default: Story = {
  render: () => <InteractiveStackLens />,
  parameters: {
    docs: {
      description: {
        story:
          "Default stack view with 3 tasks ready to start. Click 'Start Timer' to begin.",
      },
    },
  },
};

/**
 * 2. Timer Running
 * Active task with running timer
 */
export const TimerRunning: Story = {
  render: () => <InteractiveStackLens initialTasks={activeTaskStack} />,
  parameters: {
    docs: {
      description: {
        story: "Stack with active task and running timer.",
      },
    },
  },
};

/**
 * 3. With Enforcement
 * Stack with active enforcement badge
 */
export const WithEnforcement: Story = {
  render: () => (
    <InteractiveStackLens enforcementState={mockEnforcement} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Stack with enforcement badge showing blocked sites and remaining time.",
      },
    },
  },
};

/**
 * 4. Single Task
 * Stack with only one task
 */
export const SingleTask: Story = {
  render: () => <InteractiveStackLens initialTasks={singleTaskStack} />,
  parameters: {
    docs: {
      description: {
        story: "Stack with a single task - no Next or Maybe cards.",
      },
    },
  },
};

/**
 * 5. All Complete
 * Stack cleared - all tasks done
 */
export const AllComplete: Story = {
  render: () => <InteractiveStackLens initialTasks={completedStack} />,
  parameters: {
    docs: {
      description: {
        story:
          "Stack cleared! Shows celebration state and prompts for Debrief.",
      },
    },
  },
};

/**
 * 6. Interactive Demo
 * Full interactive experience
 */
export const Interactive: Story = {
  render: () => (
    <InteractiveStackLens
      initialTasks={sampleTasks}
      enforcementState={mockEnforcement}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Full interactive demo. Start timer, complete/skip tasks, see all states.",
      },
    },
  },
};

