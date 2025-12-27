import type { Meta, StoryObj } from "@storybook/react-vite";
import { ModeToggle } from "./ModeToggle";

const meta: Meta<typeof ModeToggle> = {
  title: "Atoms/ModeToggle",
  component: ModeToggle,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A cyberpunk-styled theme toggle button that cycles through dark, light, and meditative modes. Integrates with next-themes for persistent theme management with smooth animations and accessibility support.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "glow", "minimal"],
      description: "Toggle visual style variant",
    },
    size: {
      control: { type: "select" },
      options: ["default", "sm", "lg"],
      description: "Toggle size",
    },
    showLabels: {
      control: { type: "boolean" },
      description: "Show theme labels next to icon",
    },
    disableAnimations: {
      control: { type: "boolean" },
      description: "Disable all animations",
    },
    themeOrder: {
      control: { type: "object" },
      description: "Custom theme cycle order",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    variant: "default",
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <ModeToggle variant="default" />
        <span className="text-xs text-muted-foreground">Default</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <ModeToggle variant="glow" />
        <span className="text-xs text-muted-foreground">Glow</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <ModeToggle variant="minimal" />
        <span className="text-xs text-muted-foreground">Minimal</span>
      </div>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <ModeToggle size="sm" variant="glow" />
        <span className="text-xs text-muted-foreground">Small</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <ModeToggle size="default" variant="glow" />
        <span className="text-xs text-muted-foreground">Default</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <ModeToggle size="lg" variant="glow" />
        <span className="text-xs text-muted-foreground">Large</span>
      </div>
    </div>
  ),
};

export const WithLabels: Story = {
  render: () => (
    <div className="flex flex-col gap-4 items-center justify-center">
      <ModeToggle showLabels variant="glow" />
      <p className="text-sm text-muted-foreground max-w-xs text-center">
        Click to cycle through themes. Labels show current mode.
      </p>
    </div>
  ),
};

export const CustomThemeOrder: Story = {
  args: {
    variant: "glow",
    themeOrder: ["light", "dark"],
    showLabels: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Custom theme order that only cycles between light and dark modes, skipping meditative.",
      },
    },
  },
};

export const ReducedMotion: Story = {
  args: {
    variant: "glow",
    disableAnimations: true,
  },
  parameters: {
    docs: {
      description: {
        story: "Theme toggle with animations disabled for accessibility compliance.",
      },
    },
  },
};

export const Interactive: Story = {
  args: {
    variant: "glow",
    showLabels: true,
  },
  play: async ({ canvasElement }) => {
    const toggle = canvasElement.querySelector("button");
    if (!toggle) {
      throw new Error("ModeToggle button not found");
    }

    // Check button is accessible
    if (!toggle.getAttribute("title")) {
      throw new Error("ModeToggle missing accessibility title");
    }

    // Check icon is present
    const icon = toggle.querySelector("svg");
    if (!icon) {
      throw new Error("ModeToggle icon not found");
    }

    // Verify button is interactive
    if (toggle.disabled) {
      throw new Error("ModeToggle should not be disabled");
    }
  },
};

export const InNavbar: Story = {
  render: () => (
    <div className="w-full max-w-4xl mx-auto">
      <nav className="flex items-center justify-between p-4 bg-card/40 backdrop-blur-sm border border-border/40 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">S</span>
          </div>
          <span className="font-semibold text-foreground">Segrada</span>
        </div>

        <div className="flex items-center gap-4">
          <nav className="hidden md:flex items-center gap-6">
            <a
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Dashboard
            </a>
            <a
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Study
            </a>
            <a
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Practice
            </a>
          </nav>

          <ModeToggle variant="glow" />
        </div>
      </nav>
    </div>
  ),
};

export const InSidebar: Story = {
  render: () => (
    <div className="flex">
      <aside className="w-64 h-96 bg-card/40 backdrop-blur-sm border border-border/40 rounded-lg p-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-semibold text-foreground">Settings</h2>
          <ModeToggle variant="minimal" size="sm" />
        </div>

        <nav className="space-y-3">
          <a
            href="#"
            className="block text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Profile
          </a>
          <a
            href="#"
            className="block text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Preferences
          </a>
          <a
            href="#"
            className="block text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Notifications
          </a>
          <div className="pt-3 border-t border-border/20">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Theme</span>
              <ModeToggle variant="default" size="sm" />
            </div>
          </div>
        </nav>
      </aside>
    </div>
  ),
};

export const LoadingState: Story = {
  render: () => (
    <div className="flex flex-col items-center gap-4">
      <ModeToggle variant="glow" />
      <p className="text-sm text-muted-foreground">
        On initial load, shows a default icon until theme is hydrated
      </p>
    </div>
  ),
};
