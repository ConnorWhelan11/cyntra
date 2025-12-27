import { OrbitControls, Stars } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { AnimatePresence } from "framer-motion";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { GraphEdge } from "./GraphEdge";
import { GraphNode } from "./GraphNode";
import { Graph3DHandle, GraphNodeId, GraphSnapshot, LayoutMode, LayoutOptions } from "./types";
import { layoutCustom, layoutFibonacci, layoutForce, layoutRing } from "./utils";

export interface Graph3DProps {
  graph: GraphSnapshot;

  // selection / hover
  selectedNodeId?: GraphNodeId | null;
  focusedPath?: GraphNodeId[];
  highlightedNodeIds?: GraphNodeId[];
  dimUnhighlighted?: boolean;

  layout?: LayoutMode;
  layoutOptions?: LayoutOptions;

  // agent overlays
  agentActivity?: {
    mode: "idle" | "weaving" | "updating" | "explaining";
    activeNodeIds?: GraphNodeId[];
    activeEdgeIds?: string[];
  };

  // interaction
  onNodeClick?: (id: GraphNodeId) => void;
  onNodeDoubleClick?: (id: GraphNodeId) => void;
  onNodeHoverChange?: (id: GraphNodeId | null) => void;
  onBackgroundClick?: () => void;

  // visuals
  showGrid?: boolean;
  enableInstancing?: boolean;
  maxNodeCountForLabels?: number;
  embedMode?: boolean; // If true, disable environment setup (fog, lights, etc.)
}

export const Graph3D = forwardRef<Graph3DHandle, Graph3DProps>(
  (
    {
      graph,
      selectedNodeId,
      focusedPath = [],
      highlightedNodeIds = [],
      dimUnhighlighted,
      layout = "fibonacci",
      layoutOptions = {},
      agentActivity = { mode: "idle" },
      onNodeClick,
      onNodeDoubleClick,
      onNodeHoverChange,
      onBackgroundClick,
      maxNodeCountForLabels = 20,
      embedMode = false,
    },
    ref
  ) => {
    const { camera } = useThree();
    const controlsRef = useRef<OrbitControlsImpl | null>(null);
    const groupRef = useRef<THREE.Group>(null);

    // State for positions map
    const [positions, setPositions] = useState<Map<string, THREE.Vector3>>(new Map());

    // State for current layout mode
    const [currentLayout, setCurrentLayout] = useState<LayoutMode>(layout);
    const [currentLayoutOptions, setCurrentLayoutOptions] = useState<LayoutOptions>(layoutOptions);

    // Calculate positions when graph or layout changes
    useEffect(() => {
      let newPositions: Map<string, THREE.Vector3>;

      switch (currentLayout) {
        case "force":
          newPositions = layoutForce(graph.nodes, graph.edges, currentLayoutOptions);
          break;
        case "ring":
          newPositions = layoutRing(graph.nodes, currentLayoutOptions);
          break;
        case "custom":
          newPositions = layoutCustom(graph.nodes);
          break;
        case "fibonacci":
        default:
          newPositions = layoutFibonacci(graph.nodes, currentLayoutOptions);
          break;
      }
      setPositions(newPositions);
    }, [graph, currentLayout, currentLayoutOptions]);

    // Handle prop updates for layout
    useEffect(() => {
      setCurrentLayout(layout);
      setCurrentLayoutOptions(layoutOptions);
    }, [layout, layoutOptions]);

    // Imperative API
    useImperativeHandle(ref, () => ({
      focusNode: (id, options) => {
        const pos = positions.get(id);
        if (pos && controlsRef.current) {
          // Animate OrbitControls target
          // Using a simple lerp logic or just setting it for now.
          // Ideally we'd tween this, but direct assignment is okay for MVP interactivity.
          // controlsRef.current.target.lerp(pos, 0.1);
          // For immediate focus:
          controlsRef.current.target.copy(pos);

          if (options?.animateCamera) {
            // Move camera to a nice offset
            const offset = new THREE.Vector3(0, 2, 6);
            // We can't easily animate camera pos inside imperative handle without a loop or library
            // Just setting for now, assuming external animation or simple jump
            // Ideally: integration with GSAP or react-spring for camera
            camera.position.copy(pos).add(offset);
          }
        }
      },
      pulseNode: (_id, _options) => {},
      highlightPath: (_ids, _options) => {},
      showDiff: (_oldGraph, _newGraph, _options) => {},
      setLayout: (mode, opts) => {
        setCurrentLayout(mode);
        if (opts) setCurrentLayoutOptions(opts);
      },
      getNodePosition: (id) => {
        return positions.get(id);
      },
    }));

    // Slow rotation for "cinematic" feel (idle mode)
    useFrame((_state, delta) => {
      if (groupRef.current && agentActivity.mode === "idle" && !selectedNodeId) {
        groupRef.current.rotation.y += delta * 0.02; // Slower rotation
      }
    });

    // Determine visibility/dimming
    const isNodeDimmed = (id: string): boolean => {
      if (!dimUnhighlighted) return false;
      if (selectedNodeId && id === selectedNodeId) return false;
      if (focusedPath.includes(id)) return false;
      if (highlightedNodeIds.includes(id)) return false;
      if (selectedNodeId || focusedPath.length > 0 || highlightedNodeIds.length > 0) return true;
      return false;
    };

    return (
      <>
        {!embedMode && (
          <>
            {/* Environment / Background */}
            <color attach="background" args={["#050812"]} />
            <fog attach="fog" args={["#050812", 8, 25]} /> {/* Distance fog */}
            <Stars radius={90} depth={40} count={1800} factor={3} saturation={0} fade speed={0.3} />
            {/* Cinematic Lighting */}
            <ambientLight intensity={0.2} />
            <pointLight position={[10, 10, 10]} intensity={0.5} color="#4060ff" />
            <pointLight position={[-10, -5, -10]} intensity={0.3} color="#ff0080" />
            <hemisphereLight args={["#050812", "#000000", 0.5]} />
          </>
        )}
        {/* Controls */}
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.05}
          rotateSpeed={0.5}
          minDistance={3}
          maxDistance={16}
        />
        {/* Background Click Catcher */}
        <mesh visible={false} scale={[100, 100, 100]} onClick={() => onBackgroundClick?.()}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial side={THREE.BackSide} />
        </mesh>
        <group ref={groupRef}>
          {/* Edges */}
          {graph.edges.map((edge) => {
            const start = positions.get(edge.source);
            const end = positions.get(edge.target);
            if (!start || !end) return null;

            const bothInPath =
              focusedPath.includes(edge.source) && focusedPath.includes(edge.target);
            const isDimmed =
              dimUnhighlighted && !bothInPath && (focusedPath.length > 0 || !!selectedNodeId);

            return (
              <GraphEdge
                key={edge.id}
                edge={edge}
                start={start}
                end={end}
                isPathActive={bothInPath}
                isDimmed={isDimmed}
              />
            );
          })}

          {/* Nodes */}
          <AnimatePresence>
            {graph.nodes.map((node) => {
              const pos = positions.get(node.id);
              if (!pos) return null;

              const isSelected = selectedNodeId === node.id;
              const isPathActive = focusedPath.includes(node.id);

              // Show label logic: hovered, selected, active path, or sparse graph
              // We pass `showLabel` as a base visibility, but hover handles itself
              const shouldShowLabel =
                isSelected ||
                isPathActive ||
                highlightedNodeIds.includes(node.id) ||
                graph.nodes.length < maxNodeCountForLabels;

              return (
                <GraphNode
                  key={node.id}
                  node={node}
                  position={pos}
                  isSelected={isSelected}
                  isPathActive={isPathActive}
                  isHovered={false}
                  isDimmed={isNodeDimmed(node.id)}
                  showLabel={shouldShowLabel}
                  onClick={onNodeClick}
                  onDoubleClick={onNodeDoubleClick}
                  onHover={onNodeHoverChange}
                />
              );
            })}
          </AnimatePresence>
        </group>
      </>
    );
  }
);

Graph3D.displayName = "Graph3D";
