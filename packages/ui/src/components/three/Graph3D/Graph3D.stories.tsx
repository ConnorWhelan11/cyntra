import { Canvas } from "@react-three/fiber";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { Graph3D } from "./Graph3D";
import { GraphEdge, GraphNode, GraphSnapshot } from "./types";

// --- Mock Data Utilities ---

export const generateNodes = (
  count: number,
  categories: string[] = ["ADHD", "AI", "Infrastructure", "Systems", "Personal"]
): GraphNode[] => {
  const nodes: GraphNode[] = [];
  for (let i = 0; i < count; i++) {
    const cat = categories[Math.floor(Math.random() * categories.length)];
    nodes.push({
      id: `n${i}`,
      label: `Node ${i}`,
      category: cat,
      weight: 0.3 + Math.random() * 0.7,
    });
  }
  return nodes;
};

export const generateEdges = (
  nodes: GraphNode[],
  density: number = 1.2
): GraphEdge[] => {
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
      type: Math.random() > 0.8 ? "suggested" : "default",
    });
  }
  return edges;
};

// --- Base Mock Data ---

export const initialNodes: GraphNode[] = [
  { id: "n1", label: "Hyperfocus Ritual", category: "Personal", weight: 0.8 },
  { id: "n2", label: "Agent Prompt Weaving", category: "AI", weight: 0.9 },
  {
    id: "n3",
    label: "Distributed Sketchbook",
    category: "Systems",
    weight: 0.6,
  },
  { id: "n4", label: "Studio Time Blocking", category: "ADHD", weight: 0.7 },
  { id: "n5", label: "Infra Notes", category: "Infrastructure", weight: 0.5 },
  { id: "n6", label: "Podcast CICD", category: "Personal", weight: 0.4 },
];

export const initialEdges: GraphEdge[] = [
  { id: "e1", source: "n1", target: "n2" },
  { id: "e2", source: "n1", target: "n4" },
  { id: "e3", source: "n2", target: "n3" },
  { id: "e4", source: "n2", target: "n5" },
  { id: "e5", source: "n3", target: "n6" },
  { id: "e6", source: "n4", target: "n5" },
  { id: "e7", source: "n5", target: "n6" },
];

export const initialGraph: GraphSnapshot = {
  nodes: initialNodes,
  edges: initialEdges,
};

// --- Meta ---

const meta = {
  title: "Three/Graph3D",
  component: Graph3D,
  tags: [], // leave empty or storybook will crash
  parameters: {
    layout: "fullscreen",
  },
  args: {
    graph: initialGraph,
  },
  argTypes: {
    layout: {
      control: "select",
      options: ["fibonacci", "force", "ring", "custom"],
    },
  },
} satisfies Meta<typeof Graph3D>;

export default meta;
type Story = StoryObj<typeof meta>;

// --- Wrapper ---

const GraphWrapper = (props: any) => {
  const [selected, setSelected] = useState<string | null>(
    props.selectedNodeId || null
  );
  const graphToUse = props.graph || initialGraph;
  const height = props.height || "600px";
  const width = props.width || "w-full";
  const overlayText = props.overlayText;
  const wrapperClass = props.wrapperClass || "";

  useEffect(() => {
    if (props.selectedNodeId) setSelected(props.selectedNodeId);
  }, [props.selectedNodeId]);

  return (
    <div
      className={`relative ${width} bg-[#050812] overflow-hidden ${wrapperClass}`}
      style={{ height: height }}
    >
      {/* Vignette for Portal Preview if requested via wrapperClass or custom prop, 
          but simpler to just add an overlay div if needed. 
          For now, 'wrapperClass' allows passing 'shadow-inner' etc.
      */}
      {props.hasVignette && (
        <div className="absolute inset-0 z-10 pointer-events-none shadow-[inset_0_0_60px_rgba(0,0,0,0.8)]" />
      )}

      <Canvas
        camera={props.camera || { position: [0, 0, 10], fov: 45 }}
        dpr={[1, 2]}
      >
        <Graph3D
          {...props}
          graph={graphToUse}
          selectedNodeId={selected}
          onNodeClick={(id) => {
            setSelected(id);
            props.onNodeClick?.(id);
          }}
          onBackgroundClick={() => {
            setSelected(null);
            props.onBackgroundClick?.();
          }}
        />
      </Canvas>

      {/* HUD Overlay */}
      <div className="absolute top-6 right-6 pointer-events-none text-white/40 text-[10px] font-mono border border-white/10 px-3 py-1 rounded-full backdrop-blur-sm">
        {overlayText || (selected ? `SELECTED: ${selected}` : "SYSTEM: IDLE")}
      </div>
    </div>
  );
};

// --- Stories ---

// 1. MissionFocusUniverse
export const missionFocusNodes = generateNodes(25);
const missionNodeId = "mission:studio-time-blocking";
missionFocusNodes.push({
  id: missionNodeId,
  label: "Studio Time Blocking",
  category: "Mission",
  weight: 1.0,
});
export const missionFocusEdges = generateEdges(missionFocusNodes, 1.3);

export const MissionFocusUniverse: Story = {
  render: (args) => <GraphWrapper {...args} />,
  args: {
    graph: { nodes: missionFocusNodes, edges: missionFocusEdges },
    layout: "force",
    selectedNodeId: missionNodeId,
    dimUnhighlighted: true,
    maxNodeCountForLabels: 5,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Show how the graph collapses visually around a selected mission, with everything else dimmed.",
      },
    },
  },
};

// 2. GlyphExplainsDestination (Renamed from GlyphExplainsPath)
const glyphPathNodes = generateNodes(12);
const pathIds = ["n1", "n3", "n5", "n8"];
// Ensure nodes exist and form a path segment leading to destination
const destId = "n8";
const prevId = "n5";
glyphPathNodes.forEach((n) => {
  if (pathIds.includes(n.id)) {
    n.label = n.id === destId ? "SYSTEMS ARCHITECTURE" : `Step ${n.id}`;
    n.category = n.id === destId ? "Systems" : "Plan";
    n.weight = n.id === destId ? 1.0 : 0.6;
  }
});
// Ensure explicit path edge exists
const glyphPathEdges = generateEdges(glyphPathNodes, 1.1);
glyphPathEdges.push({
  id: "path-final",
  source: prevId,
  target: destId,
  type: "suggested",
});

export const GlyphExplainsDestination: Story = {
  render: (args) => <GraphWrapper {...args} />,
  args: {
    graph: { nodes: glyphPathNodes, edges: glyphPathEdges },
    layout: "force",
    focusedPath: [prevId, destId], // Show segment leading to it
    dimUnhighlighted: true,
    agentActivity: { mode: "explaining", activeNodeIds: [destId] },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Glyph narrating the destination; shows a path segment leading to the focused node.",
      },
    },
  },
};

// 3. ADHDOverwhelmZoom
export const adhdNodes = generateNodes(45); // Increased count for chaos
export const highImpactIds = ["n7", "n12", "n19"];
adhdNodes.forEach((n) => {
  if (highImpactIds.includes(n.id)) {
    n.weight = 1.0;
    n.label = `IMPORTANT ${n.id}`;
  } else {
    n.weight = 0.2;
    n.label = ""; // Hide labels for others (or rely on logic)
  }
});
export const adhdEdges = generateEdges(adhdNodes, 2.0); // High density

export const ADHDOverwhelmZoom: Story = {
  // Pass camera via render to avoid type error on Graph3D args
  render: (args) => (
    <GraphWrapper {...args} camera={{ position: [0, 0, 7], fov: 60 }} />
  ),
  args: {
    graph: { nodes: adhdNodes, edges: adhdEdges },
    layout: "fibonacci",
    highlightedNodeIds: highImpactIds, // Will force labels via updated Graph3D logic
    dimUnhighlighted: true,
    maxNodeCountForLabels: 0, // Hide all others
  },
  parameters: {
    docs: {
      description: {
        story:
          "The 'Before' state: user overwhelmed by dense chaos, with only 3 high-impact nodes cutting through.",
      },
    },
  },
};

// 4. MissionTimelineRing
export const ringNodes: GraphNode[] = [
  { id: "step1", label: "Warmup", category: "Mission", weight: 0.5 },
  { id: "step2", label: "Deep Work 1", category: "Mission", weight: 0.8 },
  { id: "step3", label: "Break", category: "Rest", weight: 0.4 },
  { id: "step4", label: "Deep Work 2", category: "Mission", weight: 0.8 },
  { id: "step5", label: "Cool Down", category: "Rest", weight: 0.5 },
  { id: "step6", label: "Log", category: "Admin", weight: 0.3 },
  { id: "step7", label: "Review", category: "Admin", weight: 0.4 },
  { id: "step8", label: "Plan Next", category: "Admin", weight: 0.6 },
];
export const ringEdges: GraphEdge[] = ringNodes.map((n, i) => ({
  id: `ring-e${i}`,
  source: n.id,
  target: ringNodes[(i + 1) % ringNodes.length].id,
  type: "default",
}));
export const ringPath = ringNodes.map((n) => n.id);

export const MissionTimelineRing: Story = {
  render: (args) => <GraphWrapper {...args} />,
  args: {
    graph: { nodes: ringNodes, edges: ringEdges },
    layout: "ring",
    layoutOptions: { radius: 6 },
    focusedPath: ringPath,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Mission as a circular timeline: each hop is a distinct phase in a focus session.",
      },
    },
  },
};

// 5. AttentionGraphWithDistractions
export const missionClusterNodes = [
  { id: "m1", label: "Outline Draft", category: "Mission", weight: 0.9 },
  { id: "m2", label: "Research Tab", category: "Mission", weight: 0.7 },
  { id: "m3", label: "Doc", category: "Mission", weight: 0.8 },
];
const distractionClusterNodes = [
  { id: "d1", label: "YouTube", category: "Distraction", weight: 0.6 },
  { id: "d2", label: "Twitter", category: "Distraction", weight: 0.5 },
  { id: "d3", label: "Random Article", category: "Distraction", weight: 0.4 },
];
export const attentionNodes = [
  ...missionClusterNodes,
  ...distractionClusterNodes,
];
export const attentionEdges: GraphEdge[] = [
  // Mission internal
  { id: "e-m1", source: "m1", target: "m2" },
  { id: "e-m2", source: "m2", target: "m3" },
  { id: "e-m3", source: "m3", target: "m1" },
  // Distraction internal
  { id: "e-d1", source: "d1", target: "d2" },
  // Leaks - use new "distraction" type for styling
  { id: "leak1", source: "m2", target: "d1", type: "distraction" },
  { id: "leak2", source: "m3", target: "d3", type: "distraction" },
];

export const AttentionGraphWithDistractions: Story = {
  render: (args) => <GraphWrapper {...args} />,
  args: {
    graph: { nodes: attentionNodes, edges: attentionEdges },
    layout: "force",
    focusedPath: missionClusterNodes.map((n) => n.id),
    highlightedNodeIds: ["d1", "d3"],
    agentActivity: { mode: "idle" },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Mission nodes glow cyan; distractions (red/orange) are connected by warning-style edges showing where attention leaked.",
      },
    },
  },
};

// 6. SemesterKnowledgeMap
const semesterLabels = [
  "Organic Chem Midterm",
  "Anki Deck: Cardio",
  "Lecture 12 Notes",
  "Project Alpha",
  "Internship App",
  "Gym Routine",
  "Meal Prep",
  "Sleep Log",
  "Kubernetes Lab",
  "React Patterns",
];
export const semesterNodes = generateNodes(30, [
  "ADHD",
  "Personal",
  "AI",
  "Systems",
  "Infrastructure",
]);
// Assign realistic labels to heavier nodes
semesterNodes.forEach((n, i) => {
  if (i < semesterLabels.length) {
    n.label = semesterLabels[i];
    n.weight = 0.6 + Math.random() * 0.4;
  }
});
export const semesterEdges = generateEdges(semesterNodes, 1.5);

export const SemesterKnowledgeMap: Story = {
  render: (args) => <GraphWrapper {...args} />,
  args: {
    graph: { nodes: semesterNodes, edges: semesterEdges },
    layout: "fibonacci",
    maxNodeCountForLabels: 40,
    dimUnhighlighted: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Full-semester knowledge map with realistic labels: everything visible, nothing yet filtered.",
      },
    },
  },
};

// 7. WeavingUpdateDiff (Unchanged mostly, just ensure it works with new types)
const WeavingUpdateDiffStory = () => {
  const [graph, setGraph] = useState(initialGraph);
  const [mode, setMode] = useState<"idle" | "weaving">("weaving");

  useEffect(() => {
    const interval = setInterval(() => {
      setMode("weaving");
      setTimeout(() => {
        setGraph((prev) => {
          if (prev.nodes.length > 10) {
            return initialGraph;
          } else {
            const newNodes = generateNodes(10);
            const newEdges = generateEdges(newNodes, 1);
            const bridgeEdge: GraphEdge = {
              id: `bridge-${Date.now()}`,
              source: initialGraph.nodes[0].id,
              target: newNodes[0].id,
            };
            return {
              nodes: [...initialGraph.nodes, ...newNodes],
              edges: [...initialGraph.edges, ...newEdges, bridgeEdge],
            };
          }
        });
      }, 800);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <GraphWrapper
      graph={graph}
      layout="force"
      layoutOptions={{ animateLayout: true, linkStrength: 0.2 }}
      agentActivity={{ mode }}
    />
  );
};

export const WeavingUpdateDiff: Story = {
  render: () => <WeavingUpdateDiffStory />,
  parameters: {
    docs: {
      description: {
        story:
          "Nodes spawn, edges re-sew, and the layout shifts as Glyph recomputes your plan.",
      },
    },
  },
};

// 8. RealmPortalPreview
export const RealmPortalPreview: Story = {
  render: (args) => (
    <GraphWrapper
      {...args}
      width="w-[260px]"
      height="260px"
      hasVignette={true}
    />
  ),
  args: {
    graph: {
      nodes: generateNodes(20),
      edges: generateEdges(generateNodes(20), 1.2),
    }, // Increased count
    layout: "fibonacci",
    layoutOptions: { radius: 3 }, // Tighter radius
    dimUnhighlighted: false,
    maxNodeCountForLabels: 0, // No labels
    agentActivity: { mode: "idle" }, // Ensure rotation
  },
  parameters: {
    docs: {
      description: {
        story:
          "A compact, vignetted portal view. Rotates slowly when idle to feel alive.",
      },
    },
  },
};

// 9. MultiMissionClusters
const clustersNodes: GraphNode[] = [];
const clustersEdges: GraphEdge[] = [];

// Mission A (Cyan)
const missionA = {
  id: "mA",
  label: "Mission A",
  category: "MissionA",
  weight: 1.0,
};
clustersNodes.push(missionA);
for (let i = 0; i < 5; i++) {
  const id = `a${i}`;
  clustersNodes.push({
    id,
    label: `Task A${i}`,
    category: "MissionA",
    weight: 0.4,
  });
  clustersEdges.push({ id: `ea${i}`, source: "mA", target: id });
}

// Mission B (Emerald)
const missionB = {
  id: "mB",
  label: "Mission B",
  category: "MissionB",
  weight: 1.0,
};
clustersNodes.push(missionB);
for (let i = 0; i < 4; i++) {
  const id = `b${i}`;
  clustersNodes.push({
    id,
    label: `Task B${i}`,
    category: "MissionB",
    weight: 0.4,
  });
  clustersEdges.push({ id: `eb${i}`, source: "mB", target: id });
}

// Mission C (Gold)
const missionC = {
  id: "mC",
  label: "Mission C",
  category: "MissionC",
  weight: 1.0,
};
clustersNodes.push(missionC);
for (let i = 0; i < 6; i++) {
  const id = `c${i}`;
  clustersNodes.push({
    id,
    label: `Task C${i}`,
    category: "MissionC",
    weight: 0.4,
  });
  clustersEdges.push({ id: `ec${i}`, source: "mC", target: id });
}

export const MultiMissionClusters: Story = {
  render: (args) => <GraphWrapper {...args} />,
  args: {
    graph: { nodes: clustersNodes, edges: clustersEdges },
    layout: "force",
    layoutOptions: { repelStrength: 50, gravity: 0.05 },
    highlightedNodeIds: ["mA", "mB", "mC"], // Highlights AND labels them
    maxNodeCountForLabels: 0, // Hide others
    selectedNodeId: "c1", // Select one task
  },
  parameters: {
    docs: {
      description: {
        story:
          "Zoomed-out mission landscape with colored clusters. Only missions and selected task are labeled.",
      },
    },
  },
};

// 10. GlyphNarrationStepByStep
const narrationPath = ["n1", "n2", "n3", "n4", "n5"];
const narrationNodes = generateNodes(15);
narrationPath.forEach((id, idx) => {
  let existing = narrationNodes.find((n) => n.id === id);
  if (!existing) {
    existing = { id, label: `Step ${idx + 1}`, category: "Plan", weight: 0.8 };
    narrationNodes.push(existing);
  }
  // Update label to be clear
  existing.label = `Step ${idx + 1}`;
});
const narrationEdges = generateEdges(narrationNodes, 1.2);
// Ensure path connectivity
for (let i = 0; i < narrationPath.length - 1; i++) {
  narrationEdges.push({
    id: `path-${i}`,
    source: narrationPath[i],
    target: narrationPath[i + 1],
    type: "suggested",
  });
}

const NarrationStory = () => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % narrationPath.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const activeNodeId = narrationPath[activeIndex];

  return (
    <GraphWrapper
      graph={{ nodes: narrationNodes, edges: narrationEdges }}
      layout="force"
      focusedPath={narrationPath}
      dimUnhighlighted={true}
      agentActivity={{ mode: "explaining", activeNodeIds: [activeNodeId] }}
      selectedNodeId={activeNodeId}
      overlayText={`Step ${activeIndex + 1} of ${narrationPath.length}: Explaining Node ${activeNodeId}`}
      camera={{ position: [0, 2, 8], fov: 50 }} // Fixed framing to see path
    />
  );
};

export const GlyphNarrationStepByStep: Story = {
  render: () => <NarrationStory />,
  parameters: {
    docs: {
      description: {
        story:
          "Glyph walks the user through a route, node by node, with camera following and overlay text explanation.",
      },
    },
  },
};
