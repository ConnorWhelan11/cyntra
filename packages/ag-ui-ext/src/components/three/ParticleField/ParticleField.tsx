import { Instance, Instances } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

interface ParticleFieldProps {
  count?: number;
  range?: number;
  color?: string;
}

interface ParticleProps {
  factor: number;
  speed: number;
  xFactor: number;
  yFactor: number;
  zFactor: number;
}

const Particle = ({ factor, speed, xFactor, yFactor, zFactor }: ParticleProps) => {
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = factor + state.clock.elapsedTime * (speed / 2);
    if (ref.current) {
      ref.current.rotation.z = t * xFactor;
      ref.current.rotation.y = t * yFactor;
      ref.current.position.x =
        Math.cos(t) +
        Math.sin(t * 1) / 10 +
        xFactor +
        Math.cos((t / 10) * factor) +
        (Math.sin(t * 1) * factor) / 10;
      ref.current.position.y =
        Math.sin(t) +
        Math.cos(t * 2) / 10 +
        yFactor +
        Math.sin((t / 10) * factor) +
        (Math.cos(t * 2) * factor) / 10;
      ref.current.position.z =
        Math.sin(t) +
        Math.cos(t * 2) / 10 +
        zFactor +
        Math.cos((t / 10) * factor) +
        (Math.sin(t * 3) * factor) / 10;
    }
  });

  return <Instance ref={ref} />;
};

export const ParticleField = ({
  count = 100,
  range = 20,
  color = "#00f0ff",
}: ParticleFieldProps) => {
  // Generate random data for instances
  const particles: ParticleProps[] = new Array(count).fill(0).map(() => ({
    factor: 0.5 + Math.random(),
    speed: 0.01 + Math.random() / 200,
    xFactor: -10 + Math.random() * 20,
    yFactor: -10 + Math.random() * 20,
    zFactor: -10 + Math.random() * 20,
  }));

  return (
    <Instances range={range} limit={count}>
      <dodecahedronGeometry args={[0.05, 0]} />
      <meshStandardMaterial
        color={color}
        roughness={0}
        metalness={0.5}
        emissive={color}
        emissiveIntensity={0.5}
      />
      {particles.map((data, i) => (
        <Particle key={i} {...data} />
      ))}
    </Instances>
  );
};
