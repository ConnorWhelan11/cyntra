import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useRef } from "react";
import * as THREE from "three";
import { GlyphObject } from "./Glyph/GlyphObject";
import type { GlyphSceneProps } from "./Glyph/types";
import { Graph3D } from "./Graph3D/Graph3D";
import { generateEdges, ringEdges, ringNodes, semesterNodes } from "./Graph3D/Graph3D.stories";
import type {
  Graph3DHandle,
  GraphEdge,
  GraphNode,
  GraphNodeId,
  GraphSnapshot,
  LayoutMode,
} from "./Graph3D/types";

// --- Meta ---

const meta: Meta = {
  title: "Experiences/GraphGod",
  tags: [], // leave empty or storybook will crash
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// --- Data Preparation: The Unified "Life Graph" ---

const NOW_NODE_ID = "node:now";
const EXAM_NODE_ID = "node:exam";
const GYM_NODE_ID = "node:gym";
const PROJECT_NODE_ID = "node:project";
const DISTRACTION_YOUTUBE = "distraction:youtube";
const DISTRACTION_TWITTER = "distraction:twitter";

// Create a merged graph from our various mocks to represent "Whole Life"
const lifeNodes: GraphNode[] = [
  // 1. Core Timeline / Mission Nodes (Ring)
  ...ringNodes.map((n) => ({
    ...n,
    id: `mission:${n.id}`,
    category: "Mission",
  })),
  // 2. High Impact / Now Nodes
  {
    id: NOW_NODE_ID,
    label: "NOW: Studio Time",
    category: "Mission",
    weight: 1.0,
  },
  {
    id: EXAM_NODE_ID,
    label: "Orgo Exam (10 Days)",
    category: "School",
    weight: 0.9,
  },
  { id: GYM_NODE_ID, label: "Gym Routine", category: "Health", weight: 0.7 },
  {
    id: PROJECT_NODE_ID,
    label: "Project Alpha",
    category: "Work",
    weight: 0.8,
  },
  // 3. Distractions
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
  // 4. General Knowledge / Semester Nodes (Background noise)
  ...semesterNodes.slice(0, 15).map((n) => ({ ...n, weight: 0.3 })),
];

// Generate edges for connectivity
const lifeEdges: GraphEdge[] = [
  // Connect Now to important things
  {
    id: "e-now-exam",
    source: NOW_NODE_ID,
    target: EXAM_NODE_ID,
    type: "suggested",
  },
  { id: "e-now-gym", source: NOW_NODE_ID, target: GYM_NODE_ID },
  { id: "e-now-proj", source: NOW_NODE_ID, target: PROJECT_NODE_ID },
  // Ring connections
  ...ringEdges.map((e) => ({
    ...e,
    id: `mission-e:${e.id}`,
    source: `mission:${e.source}`,
    target: `mission:${e.target}`,
  })),
  // Connect Now to start of ring
  {
    id: "e-now-ring",
    source: NOW_NODE_ID,
    target: `mission:${ringNodes[0].id}`,
  },
  // Distraction Leaks
  {
    id: "leak-1",
    source: NOW_NODE_ID,
    target: DISTRACTION_YOUTUBE,
    type: "distraction",
  },
  {
    id: "leak-2",
    source: `mission:${ringNodes[1].id}`,
    target: DISTRACTION_TWITTER,
    type: "distraction",
  },
  // Random background connections
  ...generateEdges(lifeNodes, 1.1),
];

const lifeGraph: GraphSnapshot = { nodes: lifeNodes, edges: lifeEdges };

// --- GraphGlyph Adapter (Updated to use ref for target to avoid re-renders) ---

interface GraphGlyphProps {
  state: GlyphSceneProps["state"];
  targetPosRef: React.MutableRefObject<THREE.Vector3>;
  variant?: "default" | "inGraph";
  modelUrl?: string;
}

const GraphGlyph: React.FC<GraphGlyphProps> = ({
  state,
  targetPosRef,
  variant = "inGraph",
  modelUrl,
}) => {
  const rootRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!rootRef.current) return;
    // Smoothly follow the target ref
    rootRef.current.position.lerp(targetPosRef.current, 0.05);
  });

  return (
    <group ref={rootRef}>
      <GlyphObject state={state} variant={variant} modelUrl={modelUrl} />
    </group>
  );
};

// --- Graph God Scene Component ---

type GraphGodMode = "overview" | "shrinkToNow" | "routePlanning" | "attentionLeaks";

interface GraphGodSceneProps {
  graph: GraphSnapshot;
  mode: GraphGodMode;
  focusNodeId?: GraphNodeId;
  goalNodeId?: GraphNodeId;
  routeNodeIds?: GraphNodeId[];
  highImpactNodeIds?: GraphNodeId[];
  distractionNodeIds?: GraphNodeId[];
  layout?: LayoutMode;
}

const GraphGodSceneInner = ({
  graph,
  mode,
  focusNodeId,
  goalNodeId,
  routeNodeIds = [],
  highImpactNodeIds = [],
  distractionNodeIds = [],
  layout = "fibonacci",
}: GraphGodSceneProps) => {
  const graphRef = useRef<Graph3DHandle>(null);

  // We use a ref to pass the dynamic target position to GraphGlyph
  // without re-rendering the component tree.
  const targetPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  useFrame((state) => {
    if (!graphRef.current) return;

    if (mode === "overview") {
      const t = state.clock.getElapsedTime();
      targetPosRef.current.set(Math.sin(t * 0.2) * 5, 2, Math.cos(t * 0.2) * 5);
    } else if (focusNodeId) {
      const nodePos = graphRef.current.getNodePosition(focusNodeId);
      if (nodePos) {
        targetPosRef.current.copy(nodePos).add(new THREE.Vector3(0, 2.5, 2));

        if (mode === "routePlanning" && goalNodeId) {
          const goalPos = graphRef.current.getNodePosition(goalNodeId);
          if (goalPos) {
            const time = state.clock.getElapsedTime();
            const alpha = (Math.sin(time) + 1) / 2; // 0 to 1
            const offsetGoal = goalPos.clone().add(new THREE.Vector3(0, 2.5, 2));
            targetPosRef.current.lerp(offsetGoal, alpha);
          }
        }
      }
    }
  });

  // Derived State
  const dimUnhighlighted = mode !== "overview";

  let highlightedNodeIds: string[] = [];
  let focusedPath: string[] = [];
  let glyphState: GlyphSceneProps["state"] = "idle";
  let showLabelsCount = 20;

  switch (mode) {
    case "overview":
      glyphState = "idle";
      showLabelsCount = 40;
      break;
    case "shrinkToNow":
      glyphState = "responding";
      highlightedNodeIds = [focusNodeId!, ...highImpactNodeIds].filter(Boolean);
      showLabelsCount = 0; // hide others
      break;
    case "routePlanning":
      glyphState = "thinking";
      focusedPath = routeNodeIds;
      showLabelsCount = 0;
      break;
    case "attentionLeaks":
      glyphState = "responding";
      highlightedNodeIds = distractionNodeIds;
      focusedPath = [focusNodeId!]; // Highlight where we are
      showLabelsCount = 0;
      break;
  }

  return (
    <>
      {/* Lighting & Environment (Owned by GraphGodScene) */}
      <color attach="background" args={["#050812"]} />

      {/* Fog - pushed back further so Glyph pops */}
      <fog attach="fog" args={["#050812", 18, 60]} />

      {/* Cinematic Lighting - Tuned for Scene */}
      <ambientLight intensity={0.12} />
      <directionalLight position={[8, 10, 5]} intensity={0.6} />
      <pointLight position={[10, 10, 10]} intensity={0.5} color="#4060ff" />
      <pointLight position={[-10, -5, -10]} intensity={0.3} color="#ff0080" />

      {/* The Graph */}
      <Graph3D
        ref={graphRef}
        graph={graph}
        layout={layout}
        dimUnhighlighted={dimUnhighlighted}
        highlightedNodeIds={highlightedNodeIds}
        focusedPath={focusedPath}
        selectedNodeId={focusNodeId} // Always select focus node to ground the view
        maxNodeCountForLabels={showLabelsCount}
        agentActivity={{ mode: glyphState === "thinking" ? "weaving" : "idle" }}
        embedMode={true} // Disable Graph3D's own environment
      />

      {/* The Glyph God */}
      <GraphGlyph state={glyphState} targetPosRef={targetPosRef} variant="inGraph" />

      {/* Post Processing - Owned by GraphGodScene */}
      <EffectComposer>
        <Bloom mipmapBlur intensity={0.25} luminanceThreshold={0.8} luminanceSmoothing={0.65} />
      </EffectComposer>
    </>
  );
};

// --- Container Component ---

const GraphGodContainer = (props: GraphGodSceneProps & { caption: string }) => {
  return (
    <div className="relative w-full h-[600px] rounded-2xl border border-white/10 bg-gradient-to-br from-[#020312] via-black to-[#050818] overflow-hidden">
      <Canvas
        camera={{ position: [0, 5, 15], fov: 45 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.9,
        }}
      >
        <GraphGodSceneInner {...props} />
      </Canvas>

      {/* Bottom Caption Bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none w-full max-w-lg text-center">
        <div className="px-4 py-2 rounded-full bg-black/80 border border-white/20 backdrop-blur-md text-sm font-mono text-cyan-200 shadow-xl shadow-cyan-900/20 pointer-events-auto">
          {props.caption}
        </div>
        <div className="flex gap-4 text-[10px] uppercase tracking-widest text-white/30">
          <span>Mode: {props.mode}</span>
          <span>Focus: {props.focusNodeId || "None"}</span>
        </div>
      </div>
    </div>
  );
};

// --- Stories ---

// 1. Overview
export const WholeLifeGraph_Overview: Story = {
  render: () => (
    <GraphGodContainer
      graph={lifeGraph}
      mode="overview"
      focusNodeId={NOW_NODE_ID}
      caption="“This is your whole life graph – school, work, health, everything in one place.”"
    />
  ),
};

// 2. Shrink to Now (Hero)
export const WholeLife_ShrinkToNow: Story = {
  render: () => (
    <GraphGodContainer
      graph={lifeGraph}
      mode="shrinkToNow"
      focusNodeId={NOW_NODE_ID}
      highImpactNodeIds={[EXAM_NODE_ID, PROJECT_NODE_ID]}
      caption="“Here’s what matters most right now, in the context of your whole life graph.”"
    />
  ),
};

// 3. Route Planning
const routeNodes = [NOW_NODE_ID, `mission:${ringNodes[0].id}`, EXAM_NODE_ID]; // Simplified path
export const RoutePlanning_ToExam: Story = {
  render: () => (
    <GraphGodContainer
      graph={lifeGraph}
      mode="routePlanning"
      focusNodeId={NOW_NODE_ID}
      goalNodeId={EXAM_NODE_ID}
      routeNodeIds={routeNodes}
      caption="“I’ve woven a route from now to your Orgo exam that fits your time and energy.”"
    />
  ),
};

// 4. Attention Leaks
export const AttentionLeaks_Pruning: Story = {
  render: () => (
    <GraphGodContainer
      graph={lifeGraph}
      mode="attentionLeaks"
      focusNodeId={NOW_NODE_ID}
      distractionNodeIds={[DISTRACTION_YOUTUBE, DISTRACTION_TWITTER]}
      caption="“These branches leak away from your exam goal. Want me to prune them for the next 25 minutes?”"
    />
  ),
};

// 5. Mission Ring (You Are Here)
export const MissionRoute_YouAreHere: Story = {
  render: () => (
    <GraphGodContainer
      graph={lifeGraph}
      mode="routePlanning" // Use route planning mode to highlight path
      focusNodeId={`mission:${ringNodes[1].id}`} // Step 2
      routeNodeIds={ringNodes.map((n) => `mission:${n.id}`)}
      layout="ring" // Force ring layout for this specific view (or use force if stable)
      caption="“You’re here in the mission loop. Next hop is Deep Work 2.”"
    />
  ),
};
