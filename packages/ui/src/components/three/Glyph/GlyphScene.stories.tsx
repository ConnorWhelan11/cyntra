import type { Meta, StoryObj } from "@storybook/react-vite";
import { GlyphScene } from "./GlyphScene";

const meta: Meta<typeof GlyphScene> = {
  title: "Three/GlyphScene",
  component: GlyphScene,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Animated 3D Glyph component with multiple states. The glyph model supports idle, listening, thinking, responding, success, error, and sleep animations.",
      },
    },
  },
  args: {
    state: "idle",
    scale: 0.9,
  },
  argTypes: {
    state: {
      control: "select",
      options: [
        "idle",
        "listening",
        "thinking",
        "responding",
        "success",
        "error",
        "sleep",
      ],
      description: "Animation state of the glyph",
    },
    scale: {
      control: { type: "range", min: 0.5, max: 2, step: 0.1 },
      description: "Scale multiplier for the glyph",
    },
    position: {
      control: "object",
      description: "3D position [x, y, z]",
    },
    className: {
      control: "text",
      description: "CSS class name for the container",
    },
  },
} satisfies Meta<typeof GlyphScene>;

export default meta;
type Story = StoryObj<typeof meta>;

const GlyphCanvas = (args: Story["args"]) => {
  return (
    <div className="relative h-[600px] w-full max-w-4xl overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-slate-950 via-slate-900 to-black">
      <GlyphScene {...args} className="h-full w-full" />
    </div>
  );
};

export const Idle: Story = {
  args: {
    state: "idle",
    scale: 0.9,
  },
  render: (args) => <GlyphCanvas {...args} />,
};

export const Listening: Story = {
  args: {
    state: "listening",
    scale: 1.1,
  },
  render: (args) => <GlyphCanvas {...args} />,
};

export const Thinking: Story = {
  args: {
    state: "thinking",
    scale: 1.1,
  },
  render: (args) => <GlyphCanvas {...args} />,
};

export const Responding: Story = {
  args: {
    state: "responding",
    scale: 1.1,
  },
  render: (args) => <GlyphCanvas {...args} />,
};

export const Success: Story = {
  args: {
    state: "success",
    scale: 1.1,
  },
  render: (args) => <GlyphCanvas {...args} />,
};

export const Error: Story = {
  args: {
    state: "error",
    scale: 1.1,
  },
  render: (args) => <GlyphCanvas {...args} />,
};

export const Sleep: Story = {
  args: {
    state: "sleep",
    scale: 1.1,
  },
  render: (args) => <GlyphCanvas {...args} />,
};
