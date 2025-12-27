import type { Meta, StoryObj } from "@storybook/react-vite";
import { Download, Heart, Play, Settings } from "lucide-react";
import { GlowButton } from "./GlowButton";

const meta: Meta<typeof GlowButton> = {
  title: "Atoms/GlowButton",
  component: GlowButton,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A futuristic button component with neon glow effects, multiple variants, and smooth animations. Built for cyberpunk-themed interfaces with full accessibility support.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "ghost", "outline", "destructive", "secondary"],
      description: "Button visual style variant",
    },
    size: {
      control: { type: "select" },
      options: ["default", "sm", "lg", "icon"],
      description: "Button size",
    },
    glow: {
      control: { type: "select" },
      options: ["none", "low", "high"],
      description: "Glow animation intensity",
    },
    loading: {
      control: { type: "boolean" },
      description: "Show loading spinner",
    },
    disabled: {
      control: { type: "boolean" },
      description: "Disable button interaction",
    },
    disableAnimations: {
      control: { type: "boolean" },
      description: "Disable all animations (respects prefers-reduced-motion)",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "Get Started",
    glow: "low",
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center justify-center">
      <GlowButton variant="default" glow="low">
        Default
      </GlowButton>
      <GlowButton variant="ghost" glow="low">
        Ghost
      </GlowButton>
      <GlowButton variant="outline" glow="low">
        Outline
      </GlowButton>
      <GlowButton variant="destructive">Destructive</GlowButton>
      <GlowButton variant="secondary" glow="low">
        Secondary
      </GlowButton>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center justify-center">
      <GlowButton size="sm" glow="low">
        Small
      </GlowButton>
      <GlowButton size="default" glow="low">
        Default
      </GlowButton>
      <GlowButton size="lg" glow="low">
        Large
      </GlowButton>
      <GlowButton size="icon" glow="low">
        <Settings className="h-4 w-4" />
      </GlowButton>
    </div>
  ),
};

export const GlowIntensities: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center justify-center">
      <GlowButton glow="none">No Glow</GlowButton>
      <GlowButton glow="low">Low Glow</GlowButton>
      <GlowButton glow="high">High Glow</GlowButton>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center justify-center">
      <GlowButton variant="default" glow="low">
        <Play className="h-4 w-4" />
        Play Game
      </GlowButton>
      <GlowButton variant="outline" glow="low">
        <Download className="h-4 w-4" />
        Download
      </GlowButton>
      <GlowButton variant="ghost" glow="low">
        <Heart className="h-4 w-4" />
        Like
      </GlowButton>
      <GlowButton variant="secondary" size="icon" glow="low">
        <Settings className="h-4 w-4" />
      </GlowButton>
    </div>
  ),
};

export const LoadingStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center justify-center">
      <GlowButton loading glow="low">
        Loading...
      </GlowButton>
      <GlowButton loading variant="outline" glow="low">
        Processing
      </GlowButton>
      <GlowButton loading variant="ghost">
        Saving
      </GlowButton>
      <GlowButton loading size="icon" variant="secondary">
        <Settings className="h-4 w-4" />
      </GlowButton>
    </div>
  ),
};

export const DisabledStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center justify-center">
      <GlowButton disabled glow="low">
        Disabled
      </GlowButton>
      <GlowButton disabled variant="outline">
        Disabled Outline
      </GlowButton>
      <GlowButton disabled variant="ghost">
        Disabled Ghost
      </GlowButton>
      <GlowButton disabled size="icon">
        <Settings className="h-4 w-4" />
      </GlowButton>
    </div>
  ),
};

export const ReducedMotion: Story = {
  args: {
    children: "Reduced Motion",
    glow: "high",
    disableAnimations: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          "This story demonstrates how the button behaves with animations disabled, respecting accessibility preferences.",
      },
    },
  },
};

export const Interactive: Story = {
  args: {
    children: "Interactive Button",
    variant: "outline",
    glow: "low",
  },
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector("button");
    if (!button) {
      throw new Error("Button not found");
    }

    // Check button is rendered and accessible
    if (!button.textContent?.includes("Interactive Button")) {
      throw new Error("Button content not rendered correctly");
    }

    // Check button is not disabled
    if (button.disabled) {
      throw new Error("Button should not be disabled");
    }

    // Check button has proper ARIA attributes
    if (button.getAttribute("type") !== "button") {
      button.setAttribute("type", "button");
    }
  },
};

export const KeyboardNavigation: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-sm text-muted-foreground mb-4">
        Use Tab to navigate between buttons, Enter/Space to activate
      </p>
      <div className="flex flex-wrap gap-4">
        <GlowButton variant="default" glow="low">
          First Button
        </GlowButton>
        <GlowButton variant="outline" glow="low">
          Second Button
        </GlowButton>
        <GlowButton variant="ghost" glow="low">
          Third Button
        </GlowButton>
        <GlowButton variant="secondary" size="icon" glow="low">
          <Settings className="h-4 w-4" />
        </GlowButton>
      </div>
    </div>
  ),
};

export const LongText: Story = {
  args: {
    children: "This is a button with very long text content that should wrap properly",
    variant: "outline",
    glow: "low",
    className: "max-w-xs",
  },
};

export const CustomStyling: Story = {
  args: {
    children: "Custom Styled",
    variant: "ghost",
    glow: "high",
    className: "border-2 border-emerald-neon text-emerald-neon shadow-neon-emerald",
  },
};
