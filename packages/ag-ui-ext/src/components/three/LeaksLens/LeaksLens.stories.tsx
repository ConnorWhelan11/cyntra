"use client";

import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useCallback, useState } from "react";

import type { GraphEdge, GraphNode, GraphSnapshot } from "../Graph3D/types";

import { LeaksLens } from "./LeaksLens";
import type {
  DistractionNode,
  LeakAction,
  LeakSeverity,
  LeaksLensProps,
  SuppressionConfig,
} from "./types";

// --- Mock Data ---

// Graph nodes including distractions
const graphNodes: GraphNode[] = [
  { id: "now", label: "NOW", category: "Mission", weight: 1.0 },
  { id: "goal:orgo", label: "Orgo Exam", category: "Goal", weight: 0.9 },
  { id: "task:chapter12", label: "Chapter 12", category: "Task", weight: 0.7 },
  {
    id: "distraction:youtube",
    label: "YouTube",
    category: "Distraction",
    weight: 0.5,
  },
  {
    id: "distraction:twitter",
    label: "Twitter",
    category: "Distraction",
    weight: 0.4,
  },
  {
    id: "distraction:reddit",
    label: "Reddit",
    category: "Distraction",
    weight: 0.35,
  },
  {
    id: "distraction:discord",
    label: "Discord",
    category: "Distraction",
    weight: 0.3,
  },
];

const graphEdges: GraphEdge[] = [
  { id: "e1", source: "now", target: "goal:orgo" },
  { id: "e2", source: "goal:orgo", target: "task:chapter12" },
  {
    id: "leak1",
    source: "now",
    target: "distraction:youtube",
    type: "distraction",
  },
  {
    id: "leak2",
    source: "task:chapter12",
    target: "distraction:twitter",
    type: "distraction",
  },
  {
    id: "leak3",
    source: "now",
    target: "distraction:reddit",
    type: "distraction",
  },
  {
    id: "leak4",
    source: "now",
    target: "distraction:discord",
    type: "distraction",
  },
];

const mockGraph: GraphSnapshot = { nodes: graphNodes, edges: graphEdges };

// Helper to create distraction
const createDistraction = (
  id: string,
  label: string,
  severity: LeakSeverity,
  minutesAgo: number,
  sites?: string[]
): DistractionNode => ({
  nodeId: `distraction:${id}`,
  label,
  severity,
  lastAccessed: new Date(Date.now() - minutesAgo * 60 * 1000),
  sites,
  action: "block",
});

// Sample distractions
const sampleDistractions: DistractionNode[] = [
  createDistraction("youtube", "YouTube", "hot", 15, ["youtube.com"]),
  createDistraction("twitter", "Twitter", "hot", 8, ["twitter.com", "x.com"]),
  createDistraction("reddit", "Reddit", "warm", 45, ["reddit.com"]),
  createDistraction("discord", "Discord", "cool", 180, ["discord.com"]),
];

// Minimal distractions
const minimalDistractions: DistractionNode[] = [
  createDistraction("youtube", "YouTube", "hot", 5, ["youtube.com"]),
];

// No distractions
const noDistractions: DistractionNode[] = [];

// --- Meta ---

const meta: Meta<typeof LeaksLens> = {
  title: "Lenses/LeaksLens",
  component: LeaksLens,
  tags: [],
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// --- Interactive Wrapper ---

interface InteractiveLeaksLensProps extends Partial<LeaksLensProps> {
  initialDistractions?: DistractionNode[];
}

const InteractiveLeaksLens: React.FC<InteractiveLeaksLensProps> = ({
  initialDistractions = sampleDistractions,
  ...props
}) => {
  const [distractions, setDistractions] = useState<DistractionNode[]>(initialDistractions);

  const handleLeakToggle = useCallback((nodeId: string, action: LeakAction) => {
    setDistractions((prev) => prev.map((d) => (d.nodeId === nodeId ? { ...d, action } : d)));
    console.log("Leak toggle:", nodeId, action);
  }, []);

  const handleSuppressionConfirm = useCallback((config: SuppressionConfig) => {
    console.log("Suppression confirmed:", config);
    alert(
      `Suppression active!\n` +
        `Blocking ${config.targetNodeIds.length} distractions\n` +
        `For ${config.duration} minutes\n` +
        `Sites: ${config.blockedSites?.join(", ") || "none"}`
    );
  }, []);

  const handleCancel = useCallback(() => {
    console.log("Cancelled");
    alert("Returning to previous lens...");
  }, []);

  const handleShowWhy = useCallback((nodeId: string) => {
    console.log("Show why:", nodeId);
    alert(`Showing connection for ${nodeId} in Graph...`);
  }, []);

  return (
    <LeaksLens
      graph={mockGraph}
      focusNodeId="now"
      goalNodeId="goal:orgo"
      focusedPath={["now", "goal:orgo", "task:chapter12"]}
      distractions={distractions}
      onLeakToggle={handleLeakToggle}
      onSuppressionConfirm={handleSuppressionConfirm}
      onSuppressionCancel={handleCancel}
      onShowWhy={handleShowWhy}
      {...props}
    />
  );
};

// --- Stories ---

/**
 * 1. Default - Multiple Leaks
 * Standard view with several distractions detected
 */
export const Default: Story = {
  render: () => <InteractiveLeaksLens />,
  parameters: {
    docs: {
      description: {
        story:
          "Default leaks view with multiple distractions detected. Toggle actions and confirm suppression.",
      },
    },
  },
};

/**
 * 2. Hot Leaks Only
 * Single critical distraction
 */
export const SingleHotLeak: Story = {
  render: () => <InteractiveLeaksLens initialDistractions={minimalDistractions} />,
  parameters: {
    docs: {
      description: {
        story: "Single hot leak - user just switched to YouTube.",
      },
    },
  },
};

/**
 * 3. No Leaks
 * Clean focus state
 */
export const NoLeaks: Story = {
  render: () => <InteractiveLeaksLens initialDistractions={noDistractions} />,
  parameters: {
    docs: {
      description: {
        story: "No leaks detected - user has clean focus.",
      },
    },
  },
};

/**
 * 4. All Hot
 * Multiple hot leaks - urgent state
 */
export const AllHot: Story = {
  render: () => (
    <InteractiveLeaksLens
      initialDistractions={[
        createDistraction("youtube", "YouTube", "hot", 2, ["youtube.com"]),
        createDistraction("twitter", "Twitter", "hot", 5, ["twitter.com"]),
        createDistraction("tiktok", "TikTok", "hot", 10, ["tiktok.com"]),
      ]}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Multiple hot leaks - user is heavily distracted.",
      },
    },
  },
};

/**
 * 5. Mixed Severity
 * Leaks of different severities
 */
export const MixedSeverity: Story = {
  render: () => (
    <InteractiveLeaksLens
      initialDistractions={[
        createDistraction("youtube", "YouTube", "hot", 5, ["youtube.com"]),
        createDistraction("slack", "Slack", "warm", 60, ["slack.com"]),
        createDistraction("email", "Gmail", "cool", 200, ["mail.google.com"]),
        createDistraction("news", "HN", "cool", 300, ["news.ycombinator.com"]),
      ]}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Mixed severity leaks showing hot, warm, and cool indicators.",
      },
    },
  },
};

/**
 * 6. Interactive Demo
 * Full interactive experience
 */
export const Interactive: Story = {
  render: () => <InteractiveLeaksLens />,
  parameters: {
    docs: {
      description: {
        story: "Full interactive demo. Toggle leak actions, select duration, confirm suppression.",
      },
    },
  },
};
