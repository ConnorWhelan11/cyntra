import { Canvas } from "@react-three/fiber";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Suspense, useMemo, useState } from "react";
import { ParticleCollector } from "./ParticleCollector";

const meta = {
  title: "Three/ParticleCollector",
  component: ParticleCollector,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Mini-game for capturing distribution shifts. Use the Storybook preview to test scoring hooks or tweak the UX before wiring it into the Out of Scope experience.",
      },
    },
  },
  argTypes: {
    active: {
      control: { type: "boolean" },
      description: "Whether the collector is currently running.",
    },
    onScoreUpdate: {
      action: "scoreUpdate",
      description: "Reported each time score/oodCollected changes.",
    },
    onGameOver: {
      action: "gameOver",
      description: "Fires when the run completes (30s limit).",
    },
  },
} satisfies Meta<typeof ParticleCollector>;

export default meta;
type Story = StoryObj<typeof meta>;

const CollectorPreview = (args: Story["args"]) => {
  const [active, setActive] = useState(false);
  const [score, setScore] = useState(0);
  const [oodCollected, setOodCollected] = useState(0);
  const [lastSummary, setLastSummary] = useState<{
    score: number;
    oodCollected: number;
    totalOod: number;
  } | null>(null);

  const overlayRows = useMemo(
    () => [
      { label: "Score", value: score },
      { label: "OOD Collected", value: oodCollected },
      { label: "Status", value: active ? "Live" : "Idle" },
    ],
    [active, oodCollected, score]
  );

  return (
    <div className="relative flex h-[520px] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border/40 bg-gradient-to-br from-slate-950 via-black to-slate-900">
      <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-200">OOD Collector</p>
          <p className="text-sm text-white/60">
            Click targets to scoop real and out-of-distribution particles.
          </p>
        </div>
        <button
          type="button"
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white/80"
          onClick={() => {
            setScore(0);
            setOodCollected(0);
            setLastSummary(null);
            setActive((prev) => !prev);
          }}
        >
          {active ? "Stop" : "Start"}
        </button>
      </div>

      <div className="relative flex-1">
        <Canvas camera={{ position: [0, 0, 10], fov: 50 }}>
          <color attach="background" args={["#030207"]} />
          <ambientLight intensity={0.7} />
          <pointLight position={[5, 5, 5]} intensity={0.8} color="#46ffe2" />
          <pointLight position={[-5, -4, -5]} intensity={0.5} color="#ff4dd8" />
          <Suspense fallback={null}>
            <ParticleCollector
              {...args}
              active={active}
              onScoreUpdate={(nextScore, nextOod) => {
                setScore(nextScore);
                setOodCollected(nextOod);
                args?.onScoreUpdate?.(nextScore, nextOod);
              }}
              onGameOver={(summary) => {
                setLastSummary(summary);
                setActive(false);
                args?.onGameOver?.(summary);
              }}
            />
          </Suspense>
        </Canvas>

        <div className="pointer-events-none absolute left-4 top-4 grid grid-cols-1 gap-2 text-white/80 sm:grid-cols-3">
          {overlayRows.map((row) => (
            <div
              key={row.label}
              className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs backdrop-blur"
            >
              <div className="text-white/50">{row.label}</div>
              <div className="text-base font-semibold text-white/90">{row.value}</div>
            </div>
          ))}
        </div>
      </div>

      {lastSummary && (
        <div className="border-t border-white/5 px-6 py-4 text-xs text-white/70">
          Mission Summary → Score {lastSummary.score}, OOD {lastSummary.oodCollected}/
          {lastSummary.totalOod}
        </div>
      )}
    </div>
  );
};

export const MiniGame: Story = {
  render: (args) => <CollectorPreview {...args} />,
};
