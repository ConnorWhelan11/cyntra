import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Battery,
  Bell,
  Heart,
  Pause,
  Play,
  Settings,
  Signal,
  Star,
  Volume2,
  Wifi,
  Zap,
} from "lucide-react";
import { IconPulse } from "./IconPulse";

const meta: Meta<typeof IconPulse> = {
  title: "Atoms/IconPulse",
  component: IconPulse,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A versatile icon wrapper with pulse animations, glow effects, and hover interactions. Perfect for status indicators, interactive buttons, and attention-drawing elements in cyberpunk interfaces.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "muted", "accent", "success", "warning", "danger"],
      description: "Icon color variant",
    },
    size: {
      control: { type: "select" },
      options: ["sm", "default", "lg", "xl"],
      description: "Icon size",
    },
    intensity: {
      control: { type: "select" },
      options: ["none", "low", "medium", "high"],
      description: "Glow effect intensity",
    },
    interactive: {
      control: { type: "select" },
      options: ["none", "hover", "button"],
      description: "Interaction behavior",
    },
    pulse: {
      control: { type: "boolean" },
      description: "Pulse animation on hover/focus",
    },
    continuousPulse: {
      control: { type: "boolean" },
      description: "Continuous pulse animation",
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
    icon: <Heart className="h-5 w-5" />,
    pulse: true,
    intensity: "low",
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6 items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <IconPulse variant="default" icon={<Star className="h-5 w-5" />} pulse />
        <span className="text-xs text-muted-foreground">Default</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconPulse variant="muted" icon={<Settings className="h-5 w-5" />} pulse />
        <span className="text-xs text-muted-foreground">Muted</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconPulse variant="accent" icon={<Zap className="h-5 w-5" />} pulse intensity="medium" />
        <span className="text-xs text-muted-foreground">Accent</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconPulse
          variant="success"
          icon={<Heart className="h-5 w-5" />}
          pulse
          intensity="medium"
        />
        <span className="text-xs text-muted-foreground">Success</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconPulse variant="warning" icon={<Bell className="h-5 w-5" />} pulse intensity="medium" />
        <span className="text-xs text-muted-foreground">Warning</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconPulse variant="danger" icon={<Zap className="h-5 w-5" />} pulse intensity="high" />
        <span className="text-xs text-muted-foreground">Danger</span>
      </div>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6 items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <IconPulse size="sm" icon={<Heart className="h-4 w-4" />} variant="accent" pulse />
        <span className="text-xs text-muted-foreground">Small</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconPulse size="default" icon={<Heart className="h-5 w-5" />} variant="accent" pulse />
        <span className="text-xs text-muted-foreground">Default</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconPulse size="lg" icon={<Heart className="h-6 w-6" />} variant="accent" pulse />
        <span className="text-xs text-muted-foreground">Large</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconPulse size="xl" icon={<Heart className="h-8 w-8" />} variant="accent" pulse />
        <span className="text-xs text-muted-foreground">Extra Large</span>
      </div>
    </div>
  ),
};

export const GlowIntensities: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6 items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <IconPulse intensity="none" icon={<Zap className="h-5 w-5" />} variant="accent" />
        <span className="text-xs text-muted-foreground">No Glow</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconPulse intensity="low" icon={<Zap className="h-5 w-5" />} variant="accent" />
        <span className="text-xs text-muted-foreground">Low Glow</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconPulse intensity="medium" icon={<Zap className="h-5 w-5" />} variant="accent" />
        <span className="text-xs text-muted-foreground">Medium Glow</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconPulse intensity="high" icon={<Zap className="h-5 w-5" />} variant="accent" />
        <span className="text-xs text-muted-foreground">High Glow</span>
      </div>
    </div>
  ),
};

export const InteractiveButtons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center justify-center">
      <IconPulse
        icon={<Play className="h-5 w-5" />}
        variant="success"
        pulse
        intensity="medium"
        onClick={() => alert("Play clicked!")}
        aria-label="Play"
      />
      <IconPulse
        icon={<Pause className="h-5 w-5" />}
        variant="warning"
        pulse
        intensity="medium"
        onClick={() => alert("Pause clicked!")}
        aria-label="Pause"
      />
      <IconPulse
        icon={<Settings className="h-5 w-5" />}
        variant="muted"
        pulse
        onClick={() => alert("Settings clicked!")}
        aria-label="Settings"
      />
    </div>
  ),
};

export const StatusIndicators: Story = {
  render: () => (
    <div className="p-6 bg-card/40 backdrop-blur-sm border border-border/40 rounded-lg space-y-4">
      <h3 className="text-lg font-semibold text-foreground">System Status</h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3">
          <IconPulse
            icon={<Wifi className="h-4 w-4" />}
            variant="success"
            intensity="low"
            continuousPulse
          />
          <span className="text-sm">Connection: Online</span>
        </div>

        <div className="flex items-center gap-3">
          <IconPulse
            icon={<Battery className="h-4 w-4" />}
            variant="warning"
            intensity="medium"
            continuousPulse
          />
          <span className="text-sm">Battery: 25%</span>
        </div>

        <div className="flex items-center gap-3">
          <IconPulse icon={<Signal className="h-4 w-4" />} variant="accent" intensity="low" />
          <span className="text-sm">Signal: Strong</span>
        </div>

        <div className="flex items-center gap-3">
          <IconPulse icon={<Volume2 className="h-4 w-4" />} variant="muted" />
          <span className="text-sm">Audio: Muted</span>
        </div>
      </div>
    </div>
  ),
};

export const ContinuousPulse: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6 items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <IconPulse
          icon={<Heart className="h-6 w-6" />}
          variant="danger"
          intensity="medium"
          continuousPulse
        />
        <span className="text-xs text-muted-foreground">Heartbeat</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconPulse
          icon={<Wifi className="h-6 w-6" />}
          variant="success"
          intensity="low"
          continuousPulse
        />
        <span className="text-xs text-muted-foreground">Connected</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <IconPulse
          icon={<Bell className="h-6 w-6" />}
          variant="warning"
          intensity="medium"
          continuousPulse
        />
        <span className="text-xs text-muted-foreground">Alert</span>
      </div>
    </div>
  ),
};

export const ReducedMotion: Story = {
  args: {
    icon: <Zap className="h-5 w-5" />,
    variant: "accent",
    intensity: "high",
    pulse: true,
    continuousPulse: true,
    disableAnimations: true,
  },
  parameters: {
    docs: {
      description: {
        story: "Demonstrates how the icon behaves with animations disabled for accessibility.",
      },
    },
  },
};

export const Interactive: Story = {
  args: {
    icon: <Star className="h-5 w-5" />,
    variant: "accent",
    pulse: true,
    intensity: "medium",
    onClick: () => alert("Star clicked!"),
    "aria-label": "Favorite this item",
  },
  play: async ({ canvasElement }) => {
    const iconButton = canvasElement.querySelector("button");
    if (!iconButton) {
      throw new Error("Interactive IconPulse not found");
    }

    // Check accessibility attributes
    if (!iconButton.getAttribute("aria-label")) {
      throw new Error("IconPulse missing aria-label");
    }

    // Check icon is present
    const icon = iconButton.querySelector("svg");
    if (!icon) {
      throw new Error("Icon not found inside IconPulse");
    }

    // Check interactivity
    if (!iconButton.onclick && !iconButton.getAttribute("onclick")) {
      throw new Error("IconPulse should be interactive");
    }
  },
};
