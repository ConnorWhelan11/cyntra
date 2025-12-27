import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useState, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";

export const NodeLine = ({
  nodeRef,
  color,
  containmentProgress,
}: {
  nodeRef: RefObject<THREE.Group | null>;
  color: string;
  containmentProgress: MutableRefObject<number>;
}) => {
  const [linePoints, setLinePoints] = useState<
    [[number, number, number], [number, number, number]]
  >([
    [0, 0, 0],
    [0, 0, 0],
  ]);
  const [opacity, setOpacity] = useState(0);
  const frameCount = useRef(0);

  useFrame(() => {
    if (!nodeRef.current) return;

    // Only update every 3rd frame for performance
    frameCount.current++;
    if (frameCount.current % 3 !== 0) return;

    const pos = nodeRef.current.position;
    const newOpacity = 0.18 * containmentProgress.current;

    // Update line points to go from node (local 0,0,0) toward box center
    setLinePoints([
      [0, 0, 0],
      [-pos.x, -pos.y, -pos.z],
    ]);
    setOpacity(newOpacity);
  });

  return <Line points={linePoints} color={color} lineWidth={1} transparent opacity={opacity} />;
};
