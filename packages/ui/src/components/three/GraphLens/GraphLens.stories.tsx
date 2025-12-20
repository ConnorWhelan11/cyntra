"use client";

import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useCallback, useState } from "react";

import type { GraphEdge, GraphNode, GraphSnapshot } from "../Graph3D/types";
import { GraphLens } from "./GraphLens";
import type { GraphLensMode, GraphLensProps } from "./types";

// --- Mock Data ---

const NOW_NODE_ID = "node:now";
const EXAM_NODE_ID = "node:exam";
const GYM_NODE_ID = "node:gym";
const PROJECT_NODE_ID = "node:project";
const DISTRACTION_YOUTUBE = "distraction:youtube";
const DISTRACTION_TWITTER = "distraction:twitter";
const DISTRACTION_REDDIT = "distraction:reddit";

// Goal nodes
const GOAL_MED_SCHOOL = "goal:med-school";
const GOAL_FITNESS = "goal:fitness";
const GOAL_PORTFOLIO = "goal:portfolio";

// Mission ring nodes
const missionRingNodes: GraphNode[] = [
  { id: "mission:warmup", label: "Warmup", category: "Mission", weight: 0.5 },
  {
    id: "mission:deep-work-1",
    label: "Deep Work 1",
    category: "Mission",
    weight: 0.8,
  },
  { id: "mission:break-1", label: "Break", category: "Rest", weight: 0.4 },
  {
    id: "mission:deep-work-2",
    label: "Deep Work 2",
    category: "Mission",
    weight: 0.8,
  },
  {
    id: "mission:cool-down",
    label: "Cool Down",
    category: "Rest",
    weight: 0.5,
  },
  { id: "mission:log", label: "Log", category: "Admin", weight: 0.3 },
];

// Mission ring edges
const missionRingEdges: GraphEdge[] = missionRingNodes.map((n, i) => ({
  id: `ring-e${i}`,
  source: n.id,
  target: missionRingNodes[(i + 1) % missionRingNodes.length].id,
  type: "default",
}));

// Generate some background nodes for the semester
const generateBackgroundNodes = (count: number): GraphNode[] => {
  const categories = ["School", "Work", "Health", "Personal", "Admin"];
  const labels = [
    "Lecture Notes",
    "Lab Report",
    "Study Group",
    "Office Hours",
    "Midterm Prep",
    "Paper Draft",
    "Code Review",
    "Team Standup",
    "Yoga Class",
    "Meal Prep",
    "Sleep Schedule",
    "Vitamins",
    "Call Mom",
    "Email Reply",
    "Calendar Review",
    "Budget Check",
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: `bg:${i}`,
    label: labels[i % labels.length],
    category: categories[i % categories.length],
    weight: 0.2 + Math.random() * 0.3,
  }));
};

// Generate random edges
const generateEdges = (nodes: GraphNode[], density = 1.2): GraphEdge[] => {
  const edges: GraphEdge[] = [];
  const count = Math.floor(nodes.length * density);

  for (let i = 0; i < count; i++) {
    const source = nodes[Math.floor(Math.random() * nodes.length)].id;
    let target = nodes[Math.floor(Math.random() * nodes.length)].id;
    while (target === source) {
      target = nodes[Math.floor(Math.random() * nodes.length)].id;
    }
    edges.push({
      id: `e${i}`,
      source,
      target,
      type: Math.random() > 0.85 ? "suggested" : "default",
    });
  }
  return edges;
};

// Build the complete Life Graph
const backgroundNodes = generateBackgroundNodes(15);

const lifeNodes: GraphNode[] = [
  // NOW node (center of attention)
  {
    id: NOW_NODE_ID,
    label: "NOW: Studio Time",
    category: "Mission",
    weight: 1.0,
  },

  // Goal nodes
  {
    id: GOAL_MED_SCHOOL,
    label: "Get into Med School",
    category: "Goal",
    weight: 0.95,
  },
  {
    id: GOAL_FITNESS,
    label: "Stay Fit",
    category: "Goal",
    weight: 0.85,
  },
  {
    id: GOAL_PORTFOLIO,
    label: "Ship Portfolio",
    category: "Goal",
    weight: 0.8,
  },

  // High-impact nodes
  {
    id: EXAM_NODE_ID,
    label: "Orgo Exam (10 Days)",
    category: "School",
    weight: 0.9,
  },
  {
    id: GYM_NODE_ID,
    label: "Gym Routine",
    category: "Health",
    weight: 0.7,
  },
  {
    id: PROJECT_NODE_ID,
    label: "Project Alpha",
    category: "Work",
    weight: 0.8,
  },

  // Distractions
  {
    id: DISTRACTION_YOUTUBE,
    label: "YouTube",
    category: "Distraction",
    weight: 0.5,
  },
  {
    id: DISTRACTION_TWITTER,
    label: "Twitter",
    category: "Distraction",
    weight: 0.4,
  },
  {
    id: DISTRACTION_REDDIT,
    label: "Reddit",
    category: "Distraction",
    weight: 0.35,
  },

  // Mission ring
  ...missionRingNodes,

  // Background nodes
  ...backgroundNodes,
];

const lifeEdges: GraphEdge[] = [
  // NOW connections
  {
    id: "e-now-exam",
    source: NOW_NODE_ID,
    target: EXAM_NODE_ID,
    type: "suggested",
  },
  { id: "e-now-gym", source: NOW_NODE_ID, target: GYM_NODE_ID },
  { id: "e-now-proj", source: NOW_NODE_ID, target: PROJECT_NODE_ID },
  { id: "e-now-ring", source: NOW_NODE_ID, target: missionRingNodes[0].id },

  // Goal connections
  { id: "e-goal-exam", source: GOAL_MED_SCHOOL, target: EXAM_NODE_ID },
  { id: "e-goal-gym", source: GOAL_FITNESS, target: GYM_NODE_ID },
  { id: "e-goal-proj", source: GOAL_PORTFOLIO, target: PROJECT_NODE_ID },

  // Mission ring edges
  ...missionRingEdges,

  // Distraction leaks (red warning edges)
  {
    id: "leak-yt",
    source: NOW_NODE_ID,
    target: DISTRACTION_YOUTUBE,
    type: "distraction",
  },
  {
    id: "leak-tw",
    source: missionRingNodes[1].id,
    target: DISTRACTION_TWITTER,
    type: "distraction",
  },
  {
    id: "leak-rd",
    source: EXAM_NODE_ID,
    target: DISTRACTION_REDDIT,
    type: "distraction",
  },

  // Random background connections
  ...generateEdges(lifeNodes, 0.8),
];

const lifeGraph: GraphSnapshot = { nodes: lifeNodes, edges: lifeEdges };

// Route from NOW to EXAM
const routeToExam = [
  NOW_NODE_ID,
  missionRingNodes[0].id,
  missionRingNodes[1].id,
  EXAM_NODE_ID,
];

// --- Meta ---

const meta: Meta<typeof GraphLens> = {
  title: "Lenses/GraphLens",
  component: GraphLens,
  tags: [],
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    mode: {
      control: "select",
      options: ["overview", "shrinkToNow", "routePlanning", "attentionLeaks"],
    },
    layout: {
      control: "select",
      options: ["fibonacci", "force", "ring", "custom"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// --- Interactive Wrapper ---

const InteractiveGraphLens: React.FC<Partial<GraphLensProps>> = (props) => {
  const [mode, setMode] = useState<GraphLensMode>(props.mode ?? "overview");
  const [focusNodeId, setFocusNodeId] = useState<string | undefined>(
    props.focusNodeId
  );

  const handleFocusChange = useCallback(
    (nodeId: string | null) => {
      setFocusNodeId(nodeId ?? undefined);
      // Auto-switch to shrinkToNow when a node is selected
      if (nodeId && mode === "overview") {
        setMode("shrinkToNow");
      }
    },
    [mode]
  );

  const handleModeChange = useCallback((newMode: GraphLensMode) => {
    setMode(newMode);
  }, []);

  const handlePlanRequest = useCallback(
    (context: { focusNodeId: string; goalNodeId?: string }) => {
      console.log("Plan requested:", context);
      alert(
        `Planning from ${context.focusNodeId} to ${context.goalNodeId || "goal"}`
      );
    },
    []
  );

  const handleLeaksRequest = useCallback((distractionIds: string[]) => {
    console.log("Leaks request:", distractionIds);
    alert(`Pruning ${distractionIds.length} distractions`);
  }, []);

  return (
    <GraphLens
      graph={lifeGraph}
      mode={mode}
      focusNodeId={focusNodeId}
      onFocusChange={handleFocusChange}
      onModeChange={handleModeChange}
      onPlanRequest={handlePlanRequest}
      onLeaksRequest={handleLeaksRequest}
      {...props}
    />
  );
};

// --- Stories ---

/**
 * 1. Overview Mode
 * The default "god view" showing the entire life graph
 */
export const Overview: Story = {
  render: () => (
    <InteractiveGraphLens mode="overview" focusNodeId={NOW_NODE_ID} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Full life graph in overview mode. Glyph orbits slowly around the NOW node. Click any node to focus.",
      },
    },
  },
};

/**
 * 2. Shrink to Now
 * Focused view highlighting what matters right now
 */
export const ShrinkToNow: Story = {
  render: () => (
    <GraphLens
      graph={lifeGraph}
      mode="shrinkToNow"
      focusNodeId={NOW_NODE_ID}
      highImpactNodeIds={[EXAM_NODE_ID, PROJECT_NODE_ID, GYM_NODE_ID]}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Collapsed view showing only NOW and high-impact nodes. Everything else dims to provide focus.",
      },
    },
  },
};

/**
 * 3. Route Planning
 * Visualizing a path from NOW to a goal
 */
export const RoutePlanning: Story = {
  render: () => (
    <GraphLens
      graph={lifeGraph}
      mode="routePlanning"
      focusNodeId={NOW_NODE_ID}
      goalNodeId={EXAM_NODE_ID}
      routeNodeIds={routeToExam}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Glyph weaves a route from NOW to the Orgo Exam. The path nodes are highlighted while others dim.",
      },
    },
  },
};

/**
 * 4. Attention Leaks
 * Highlighting distractions that pull focus away
 */
export const AttentionLeaks: Story = {
  render: () => (
    <GraphLens
      graph={lifeGraph}
      mode="attentionLeaks"
      focusNodeId={NOW_NODE_ID}
      distractionNodeIds={[
        DISTRACTION_YOUTUBE,
        DISTRACTION_TWITTER,
        DISTRACTION_REDDIT,
      ]}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Distraction nodes light up in red. These are the 'leaks' pulling attention from the current goal.",
      },
    },
  },
};

/**
 * 5. Mission Ring Layout
 * Using ring layout for mission timeline visualization
 */
export const MissionRing: Story = {
  render: () => (
    <GraphLens
      graph={{
        nodes: missionRingNodes,
        edges: missionRingEdges,
      }}
      mode="routePlanning"
      focusNodeId={missionRingNodes[1].id}
      routeNodeIds={missionRingNodes.map((n) => n.id)}
      layout="ring"
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Mission nodes in a ring layout representing a focus session timeline.",
      },
    },
  },
};

/**
 * 6. Interactive Demo
 * Full interactive experience with mode switching
 */
export const Interactive: Story = {
  render: () => <InteractiveGraphLens />,
  parameters: {
    docs: {
      description: {
        story:
          "Click nodes to focus, use buttons to switch modes. Full interactive demo of the Graph Lens.",
      },
    },
  },
};

/**
 * 7. Goals Focus
 * Showing the graph with goal nodes highlighted
 */
export const GoalsFocus: Story = {
  render: () => (
    <GraphLens
      graph={lifeGraph}
      mode="shrinkToNow"
      focusNodeId={GOAL_MED_SCHOOL}
      highImpactNodeIds={[GOAL_FITNESS, GOAL_PORTFOLIO, EXAM_NODE_ID]}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Focused on the Med School goal with other goals and related tasks highlighted.",
      },
    },
  },
};

/**
 * 8. Empty Graph (New User)
 * Edge case: what happens with minimal nodes
 */
export const EmptyGraph: Story = {
  render: () => (
    <GraphLens
      graph={{
        nodes: [{ id: "now", label: "NOW", category: "Mission", weight: 1.0 }],
        edges: [],
      }}
      mode="overview"
      focusNodeId="now"
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Edge case: new user with just a NOW node. Glyph should greet and offer to build the graph.",
      },
    },
  },
};
