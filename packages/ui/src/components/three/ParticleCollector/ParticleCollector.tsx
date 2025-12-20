import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface ParticleCollectorProps {
  active: boolean;
  onScoreUpdate: (score: number, oodCollected: number) => void;
  onGameOver: (stats: { score: number; oodCollected: number; totalOod: number }) => void;
}

interface GameParticle {
  id: string;
  position: THREE.Vector3;
  type: "IN_DIST" | "OOD";
  speed: number;
  active: boolean;
}

export const ParticleCollector = ({ active, onScoreUpdate, onGameOver }: ParticleCollectorProps) => {
  const { viewport, mouse } = useThree();
  const [particles, setParticles] = useState<GameParticle[]>([]);
  const [score, setScore] = useState(0);
  const [oodCollected, setOodCollected] = useState(0);
  const [totalOod, setTotalOod] = useState(0);
  
  const cursorRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);
  const activeRef = useRef(active);
  
  // Sync active ref
  useEffect(() => {
    activeRef.current = active;
    if (active) {
        // Reset game
        setParticles([]);
        setScore(0);
        setOodCollected(0);
        setTotalOod(0);
        timeRef.current = 0;
    }
  }, [active]);

  // Game Loop
  useFrame((_state, delta) => {
    if (!activeRef.current) return;

    timeRef.current += delta;

    // 1. Spawn Particles (every 0.5s approx)
    if (Math.random() < 0.05) {
        const isOod = Math.random() < 0.3; // 30% chance of OOD
        const x = (Math.random() - 0.5) * viewport.width;
        const newParticle: GameParticle = {
            id: Math.random().toString(36).substr(2, 9),
            position: new THREE.Vector3(x, viewport.height / 2 + 1, 0),
            type: isOod ? "OOD" : "IN_DIST",
            speed: 2 + Math.random() * 2,
            active: true
        };
        
        setParticles(prev => [...prev, newParticle]);
        if (isOod) setTotalOod(prev => prev + 1);
    }

    // 2. Update Particles
    setParticles(prev => prev.map(p => ({
        ...p,
        position: new THREE.Vector3(p.position.x, p.position.y - p.speed * delta, p.position.z)
    })).filter(p => p.position.y > -viewport.height / 2 - 2 && p.active));

    // 3. Update Cursor Position
    if (cursorRef.current) {
        cursorRef.current.position.x = (mouse.x * viewport.width) / 2;
        cursorRef.current.position.y = (mouse.y * viewport.height) / 2;
    }

    // 4. Check Game Over Condition (Time limit or max missed?)
    // Let's do time limit of 30s
    if (timeRef.current > 30) {
        onGameOver({ score, oodCollected, totalOod });
        activeRef.current = false;
    }
  });

  // Interaction
  useEffect(() => {
    const handleClick = () => {
        if (!activeRef.current || !cursorRef.current) return;
        
        const cursorIconPos = cursorRef.current.position;
        
        setParticles(prev => {
            const next = [...prev];
            let hit = false;
            
            for (let i = 0; i < next.length; i++) {
                const p = next[i];
                if (p.active && p.position.distanceTo(cursorIconPos) < 1.5) {
                    // Collected!
                    p.active = false;
                    hit = true;
                    
                    if (p.type === "IN_DIST") {
                        setScore(s => {
                             const newScore = s + 1;
                             // We need to update parent in a cleaner way, probably use ref or effect
                             // But direct call inside event handler is ok for now
                             return newScore;
                        });
                    } else {
                        setOodCollected(c => c + 1);
                        setScore(s => s + 5); // Bonus for OOD
                    }
                }
            }
            
            if (hit) {
                // Trigger effect?
            }
            
            return next;
        });
    };

    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  // Sync score to parent
  useEffect(() => {
    if(active) {
        onScoreUpdate(score, oodCollected);
    }
  }, [score, oodCollected, active, onScoreUpdate]);

  return (
    <group>
       {/* Cursor */}
       <group ref={cursorRef}>
          <mesh>
            <ringGeometry args={[0.5, 0.6, 32]} />
            <meshBasicMaterial color="white" transparent opacity={0.5} />
          </mesh>
          <mesh>
            <circleGeometry args={[0.1, 32]} />
            <meshBasicMaterial color="white" />
          </mesh>
       </group>

       {/* Particles */}
       {particles.map(p => (
         p.active && (
             <mesh key={p.id} position={p.position}>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshStandardMaterial 
                    color={p.type === "IN_DIST" ? "#00ff99" : "#f000ff"} 
                    emissive={p.type === "IN_DIST" ? "#00ff99" : "#f000ff"}
                    emissiveIntensity={0.5}
                />
             </mesh>
         )
       ))}
    </group>
  );
};

