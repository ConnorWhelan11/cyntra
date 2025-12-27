import type { Meta, StoryObj } from "@storybook/react-vite";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { ParticleField } from "./ParticleField";

const meta = {
  title: "Three/ParticleField",
  component: ParticleField,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Animated instanced particles rendered in React Three Fiber. Useful for lightweight nebula backdrops around hero sections or transitional scenes.",
      },
    },
  },
  argTypes: {
    count: {
      control: { type: "number", min: 20, max: 500, step: 10 },
      description: "Number of instanced spheres to render.",
    },
    color: {
      control: "color",
      description: "Base color applied to each particle.",
    },
    area: {
      control: "object",
      description: "Width/height/depth of the field as a tuple.",
    },
    size: {
      control: { type: "number", min: 0.01, max: 0.2, step: 0.01 },
      description: "Sphere radius for each particle.",
    },
  },
} satisfies Meta<typeof ParticleField>;

export default meta;
type Story = StoryObj<typeof meta>;

const ParticleStoryCanvas = (args: Story["args"]) => (
  <div className="relative h-[420px] w-full max-w-4xl overflow-hidden rounded-2xl border border-border/50 bg-black">
    <Canvas>
      <PerspectiveCamera makeDefault position={[0, 0, 8]} fov={45} />
      <ambientLight intensity={0.4} />
      <pointLight position={[5, 5, 5]} intensity={1} color="#4de4ff" />
      <pointLight position={[-5, -5, -5]} intensity={0.6} color="#ff5fce" />
      <ParticleField {...args} />
      <OrbitControls enablePan={false} />
    </Canvas>
  </div>
);

export const DefaultField: Story = {
  args: {
    count: 160,
    color: "#6ff6ff",
    area: [8, 5, 8],
    size: 0.04,
  },
  render: (args) => <ParticleStoryCanvas {...args} />,
};

export const DenseNebula: Story = {
  args: {
    count: 260,
    color: "#c084fc",
    area: [12, 12, 12],
    size: 0.035,
  },
  render: (args) => <ParticleStoryCanvas {...args} />,
  parameters: {
    docs: {
      description: {
        story: "Higher density particles spanning a wider area for a nebula-style background.",
      },
    },
  },
};

export const MinimalSparkles: Story = {
  args: {
    count: 60,
    color: "#ffffff",
    area: [4, 4, 4],
    size: 0.06,
  },
  render: (args) => <ParticleStoryCanvas {...args} />,
  parameters: {
    docs: {
      description: {
        story: "Crisp sparkles intended for overlaying a CTA or hero card.",
      },
    },
  },
};
