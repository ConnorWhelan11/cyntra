"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

interface ParticleFieldProps {
  count?: number;
  color?: string;
  area?: [number, number, number];
  size?: number;
}

export const ParticleField = ({
  count = 100,
  color = "white",
  area = [10, 10, 10],
  size = 0.02,
}: ParticleFieldProps) => {
  const mesh = useRef<THREE.InstancedMesh>(null);

  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const t = Math.random() * 100;
      const factor = 20 + Math.random() * 100;
      const speed = 0.01 + Math.random() / 200;
      const x = (Math.random() - 0.5) * area[0];
      const y = (Math.random() - 0.5) * area[1];
      const z = (Math.random() - 0.5) * area[2];
      temp.push({ t, factor, speed, x, y, z, mx: 0, my: 0 });
    }
    return temp;
  }, [count, area]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!mesh.current) return;

    particles.forEach((particle, i) => {
      let { t, speed, x, y, z } = particle;
      t = particle.t += speed / 2;
      const s = Math.cos(t);

      // Update position with some orbital/wavy movement
      dummy.position.set(
        x + Math.cos(t / 10) * 1 + Math.sin(t * 1) / 10,
        y + Math.sin(t / 10) * 1 + Math.cos(t * 2) / 10,
        z + Math.cos(t / 10) * 1 + Math.sin(t * 3) / 10
      );

      // Scale pulses
      dummy.scale.setScalar(1 + s * 0.5);
      dummy.rotation.set(s * 5, s * 5, s * 5);
      dummy.updateMatrix();

      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <sphereGeometry args={[size, 10, 10]} />
      <meshBasicMaterial color={color} transparent opacity={0.5} />
    </instancedMesh>
  );
};
