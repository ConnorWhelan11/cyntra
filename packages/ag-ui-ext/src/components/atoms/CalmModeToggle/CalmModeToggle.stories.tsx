import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CalmModeToggle } from "./CalmModeToggle";

const meta: Meta<typeof CalmModeToggle> = {
  title: "Atoms/CalmModeToggle",
  component: CalmModeToggle,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "A toggle component for switching between normal and calm visual modes. Reduces visual intensity to support focus during study sessions with localStorage persistence.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "ghost", "outline"],
      description: "Toggle button style variant",
    },
    size: {
      control: { type: "select" },
      options: ["default", "sm", "lg", "icon"],
      description: "Toggle button size",
    },
    isCalm: {
      control: { type: "boolean" },
      description: "Controlled calm mode state",
    },
    showTooltip: {
      control: { type: "boolean" },
      description: "Show tooltip on hover",
    },
    disableAnimations: {
      control: { type: "boolean" },
      description: "Disable animations",
    },
    autoPersist: {
      control: { type: "boolean" },
      description: "Auto-persist to localStorage",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    showTooltip: true,
    autoPersist: false,
  },
};

export const Controlled: Story = {
  render: () => {
    const [isCalm, setIsCalm] = useState(false);

    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Current state: {isCalm ? "Calm Mode" : "Normal Mode"}
        </div>
        <CalmModeToggle isCalm={isCalm} onCalmModeChange={setIsCalm} showTooltip={true} />
      </div>
    );
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <CalmModeToggle size="sm" />
      <CalmModeToggle size="default" />
      <CalmModeToggle size="lg" />
      <CalmModeToggle size="icon" />
    </div>
  ),
};

export const Variants: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <CalmModeToggle variant="default" />
      <CalmModeToggle variant="ghost" />
      <CalmModeToggle variant="outline" />
    </div>
  ),
};

export const WithPersistence: Story = {
  args: {
    autoPersist: true,
    showTooltip: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          "This toggle will persist its state to localStorage. Try toggling it and refreshing the page - the state should be remembered.",
      },
    },
  },
};

export const CustomIcons: Story = {
  render: () => {
    const [isCalm, setIsCalm] = useState(false);

    return (
      <CalmModeToggle
        isCalm={isCalm}
        onCalmModeChange={setIsCalm}
        calmIcon={<span className="text-emerald-500">🌙</span>}
        normalIcon={<span className="text-cyan-500">☀️</span>}
        labels={{
          calm: "Night Mode",
          normal: "Day Mode",
        }}
      />
    );
  },
};

export const InContext: Story = {
  render: () => {
    const [isCalm, setIsCalm] = useState(false);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-card rounded-lg border">
          <div>
            <h3 className="font-medium">Study Session</h3>
            <p className="text-sm text-muted-foreground">Focus on your practice questions</p>
          </div>
          <CalmModeToggle isCalm={isCalm} onCalmModeChange={setIsCalm} size="sm" />
        </div>

        <div
          className={`p-6 rounded-lg transition-colors duration-300 ${
            isCalm
              ? "bg-slate-50 border border-slate-200"
              : "bg-gradient-to-br from-cyan-neon/5 via-background to-emerald-neon/5 border border-cyan-neon/20"
          }`}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-cyan-neon rounded-full animate-pulse" />
              <span className="text-sm font-medium">Question 1 of 10</span>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">
                Which of the following is the correct mechanism for SN2 reactions?
              </h4>

              <div className="space-y-2">
                {[
                  "A. Two-step mechanism with carbocation intermediate",
                  "B. One-step mechanism with backside attack",
                  "C. Two-step mechanism with no intermediate",
                  "D. One-step mechanism with frontside attack",
                ].map((option, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded border cursor-pointer transition-colors ${
                      isCalm
                        ? "border-slate-200 hover:bg-slate-50"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    {option}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
};

export const ReducedMotion: Story = {
  args: {
    disableAnimations: true,
    showTooltip: true,
  },
};

export const IconOnly: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">Icon-only toggle with tooltip</div>
      <CalmModeToggle size="icon" showTooltip={true} />
    </div>
  ),
};
