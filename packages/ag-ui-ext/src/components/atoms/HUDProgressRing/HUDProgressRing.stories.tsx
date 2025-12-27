import type { Meta, StoryObj } from "@storybook/react-vite";
import { HUDProgressRing } from "./HUDProgressRing";

const meta: Meta<typeof HUDProgressRing> = {
  title: "Atoms/HUDProgressRing",
  component: HUDProgressRing,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A futuristic HUD-style progress ring with animated values and neon glow effects. Perfect for dashboards, progress indicators, and gaming-inspired interfaces.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    value: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      description: "Progress value from 0 to 1",
    },
    displayValue: {
      control: { type: "number" },
      description: "Custom display value (overrides calculated percentage)",
    },
    size: {
      control: { type: "range", min: 60, max: 200, step: 10 },
      description: "Ring diameter in pixels",
    },
    strokeWidth: {
      control: { type: "range", min: 2, max: 20, step: 1 },
      description: "Ring thickness",
    },
    theme: {
      control: { type: "select" },
      options: ["cyan", "magenta", "emerald", "rainbow"],
      description: "Color theme",
    },
    showValue: {
      control: { type: "boolean" },
      description: "Show animated value in center",
    },
    suffix: {
      control: { type: "text" },
      description: "Value suffix (%, XP, etc.)",
    },
    label: {
      control: { type: "text" },
      description: "Label text below ring",
    },
    disableAnimations: {
      control: { type: "boolean" },
      description: "Disable all animations",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: 0.75,
    label: "Progress",
  },
};

export const AllThemes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-8 items-center justify-center">
      <HUDProgressRing value={0.85} theme="cyan" label="Cyan Theme" />
      <HUDProgressRing value={0.65} theme="magenta" label="Magenta Theme" />
      <HUDProgressRing value={0.45} theme="emerald" label="Emerald Theme" />
      <HUDProgressRing value={0.9} theme="rainbow" label="Rainbow Theme" />
    </div>
  ),
};

export const DifferentSizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-8 items-center justify-center">
      <HUDProgressRing value={0.75} size={80} label="Small" />
      <HUDProgressRing value={0.75} size={120} label="Medium" />
      <HUDProgressRing value={0.75} size={160} label="Large" />
    </div>
  ),
};

export const CustomValues: Story = {
  render: () => (
    <div className="flex flex-wrap gap-8 items-center justify-center">
      <HUDProgressRing
        value={0.75}
        displayValue={1250}
        suffix=" XP"
        label="Experience Points"
        theme="emerald"
      />
      <HUDProgressRing
        value={0.43}
        displayValue={43}
        suffix="/100"
        label="Questions Answered"
        theme="cyan"
      />
      <HUDProgressRing
        value={0.88}
        displayValue={22}
        suffix=" days"
        label="Study Streak"
        theme="magenta"
      />
    </div>
  ),
};

export const NoAnimations: Story = {
  args: {
    value: 0.65,
    disableAnimations: true,
    label: "No Animations",
  },
};

export const WithoutValue: Story = {
  args: {
    value: 0.8,
    showValue: false,
    label: "Hidden Value",
    theme: "rainbow",
  },
};

export const ThickRing: Story = {
  args: {
    value: 0.55,
    strokeWidth: 16,
    size: 140,
    label: "Thick Ring",
    theme: "cyan",
  },
};

export const Interactive: Story = {
  args: {
    value: 0.75,
    label: "Readiness Score",
  },
  play: async ({ canvasElement }) => {
    const ring = canvasElement.querySelector("svg");
    if (!ring) {
      throw new Error("HUD Progress Ring not rendered");
    }
    const aria = ring.getAttribute("aria-label");
    if (!aria) {
      throw new Error("HUD Progress Ring missing aria-label");
    }
  },
};

export const ProgressStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-8 items-center justify-center">
      <HUDProgressRing value={0.15} theme="magenta" label="Getting Started" />
      <HUDProgressRing value={0.45} theme="emerald" label="Making Progress" />
      <HUDProgressRing value={0.75} theme="cyan" label="Almost There" />
      <HUDProgressRing value={1.0} theme="rainbow" label="Complete!" />
    </div>
  ),
};
