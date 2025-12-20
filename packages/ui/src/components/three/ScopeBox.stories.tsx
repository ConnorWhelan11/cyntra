import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ScopeBox } from "./ScopeBox";

const meta = {
  title: "Three/ScopeBox",
  component: ScopeBox,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Wireframe cube with orbiting scope nodes highlighting out-of-scope work. The story wraps the component in a ready-to-use Canvas so engineers can tweak labels or interactions.",
      },
    },
  },
  argTypes: {
    showNodes: {
      control: "boolean",
      description: "Toggles the orbiting node indicators.",
    },
    phase: {
      control: { type: "range", min: 0, max: 3, step: 1 },
      description: "Narrative phase: 0=Spec, 1=Reality, 2=Leaks, 3=Expansion",
    },
    onNodeClick: {
      action: "nodeClick",
      description: "Invoked when a node is clicked.",
    },
    enableIntro: {
      control: "boolean",
      description: "Toggle the first-time intro sequence.",
    },
    forceIntro: {
      control: "boolean",
      description: "Forces the intro sequence to run regardless of localStorage.",
    },
  },
} satisfies Meta<typeof ScopeBox>;

export default meta;
type Story = StoryObj<typeof meta>;

const ScopeBoxCanvas = (args: Story["args"]) => {
  const [lastNode, setLastNode] = useState<string | null>(null);

  return (
    <div className="relative h-[420px] w-full max-w-3xl overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-slate-950 via-slate-900 to-black">
      <Canvas camera={{ position: [4, 3, 6], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[5, 5, 5]} />
        <pointLight position={[-5, -5, -5]} color="#13f4c5" intensity={0.4} />
        <ScopeBox
          {...args}
          onNodeClick={(label) => {
            setLastNode(label);
            args?.onNodeClick?.(label);
          }}
        />
        <OrbitControls />
      </Canvas>

      {lastNode && (
        <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-white/10 bg-black/60 px-4 py-2 text-xs uppercase tracking-wide text-white/80 backdrop-blur">
          Selected: {lastNode}
        </div>
      )}
    </div>
  );
};

export const Phase0_Spec: Story = {
  args: {
    showNodes: true,
    phase: 0,
  },
  render: (args) => <ScopeBoxCanvas {...args} />,
};

export const Phase1_Reality: Story = {
  args: {
    showNodes: true,
    phase: 1,
  },
  render: (args) => <ScopeBoxCanvas {...args} />,
};

export const Phase2_Leaks: Story = {
  args: {
    showNodes: true,
    phase: 2,
  },
  render: (args) => <ScopeBoxCanvas {...args} />,
};

export const Phase3_Expansion: Story = {
  args: {
    showNodes: true,
    phase: 3,
  },
  render: (args) => <ScopeBoxCanvas {...args} />,
};

export const IntroSequence: Story = {
  args: {
    showNodes: true,
    phase: 0,
    enableIntro: true,
    forceIntro: true,
  },
  render: (args) => <ScopeBoxCanvas {...args} />,
  parameters: {
    docs: {
      description: {
        story:
          "Forces the cinematic intro: glitch text sequence followed by the orb traveling into the cube and the hero CTA reveal.",
      },
    },
  },
};
