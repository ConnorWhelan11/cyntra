import type { Meta, StoryObj } from "@storybook/react-vite";
import { Award, Heart, Shield } from "lucide-react";

import { StatBadge } from "./StatBadge";

const meta: Meta<typeof StatBadge> = {
  title: "Atoms/StatBadge",
  component: StatBadge,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A cyberpunk-styled badge component for displaying stats like XP, streaks, difficulty levels, and achievements. Features neon glow effects and smooth animations with accessibility support.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["xp", "streak", "difficulty", "achievement", "time", "score"],
      description: "Badge visual style variant",
    },
    size: {
      control: { type: "select" },
      options: ["sm", "default", "lg"],
      description: "Badge size",
    },
    glow: {
      control: { type: "select" },
      options: ["none", "subtle", "intense"],
      description: "Glow effect intensity",
    },
    value: {
      control: { type: "text" },
      description: "Stat value (numbers are auto-formatted)",
    },
    suffix: {
      control: { type: "text" },
      description: "Text suffix (XP, %, days, etc.)",
    },
    prefix: {
      control: { type: "text" },
      description: "Text prefix",
    },
    showIcon: {
      control: { type: "boolean" },
      description: "Show variant icon",
    },
    animateValue: {
      control: { type: "boolean" },
      description: "Animate value changes",
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
    variant: "xp",
    value: 1250,
    suffix: " XP",
    glow: "subtle",
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center justify-center">
      <StatBadge variant="xp" value={1250} suffix=" XP" glow="subtle" />
      <StatBadge variant="streak" value={22} suffix=" days" glow="subtle" />
      <StatBadge variant="difficulty" value="Hard" />
      <StatBadge variant="achievement" value="Gold" glow="subtle" />
      <StatBadge variant="time" value={45} suffix=" min" />
      <StatBadge variant="score" value={85} suffix="%" glow="subtle" />
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center justify-center">
      <StatBadge size="sm" variant="xp" value={500} suffix=" XP" />
      <StatBadge size="default" variant="streak" value={15} suffix=" days" />
      <StatBadge size="lg" variant="achievement" value="Platinum" />
    </div>
  ),
};

export const GlowIntensities: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center justify-center">
      <StatBadge glow="none" variant="xp" value={1000} suffix=" XP" />
      <StatBadge glow="subtle" variant="streak" value={10} suffix=" days" />
      <StatBadge glow="intense" variant="achievement" value="Legend" />
    </div>
  ),
};

export const CustomIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center justify-center">
      <StatBadge
        variant="xp"
        value={2500}
        suffix=" XP"
        icon={<Heart className="h-3 w-3" />}
        glow="subtle"
      />
      <StatBadge
        variant="streak"
        value={30}
        suffix=" days"
        icon={<Shield className="h-3 w-3" />}
        glow="subtle"
      />
      <StatBadge
        variant="achievement"
        value="Master"
        icon={<Award className="h-3 w-3" />}
        glow="subtle"
      />
    </div>
  ),
};

export const WithoutIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center justify-center">
      <StatBadge variant="xp" value={1500} suffix=" XP" showIcon={false} />
      <StatBadge variant="streak" value={18} suffix=" days" showIcon={false} />
      <StatBadge variant="difficulty" value="Expert" showIcon={false} />
    </div>
  ),
};

export const LargeNumbers: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center justify-center">
      <StatBadge variant="xp" value={1500000} suffix=" XP" glow="subtle" />
      <StatBadge variant="streak" value={365} suffix=" days" glow="subtle" />
      <StatBadge variant="score" value={99.9} suffix="%" glow="subtle" />
    </div>
  ),
};

export const DifficultyLevels: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center justify-center">
      <StatBadge variant="difficulty" value="Beginner" />
      <StatBadge variant="difficulty" value="Easy" />
      <StatBadge variant="difficulty" value="Medium" />
      <StatBadge variant="difficulty" value="Hard" />
      <StatBadge variant="difficulty" value="Expert" />
      <StatBadge variant="difficulty" value="Master" />
    </div>
  ),
};

export const AchievementBadges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center justify-center">
      <StatBadge variant="achievement" value="Bronze" glow="subtle" />
      <StatBadge variant="achievement" value="Silver" glow="subtle" />
      <StatBadge variant="achievement" value="Gold" glow="subtle" />
      <StatBadge variant="achievement" value="Platinum" glow="subtle" />
      <StatBadge variant="achievement" value="Diamond" glow="intense" />
    </div>
  ),
};

export const TimeAndProgress: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center justify-center">
      <StatBadge variant="time" value={2} suffix=" hrs" />
      <StatBadge variant="time" value={45} suffix=" min" />
      <StatBadge variant="time" value="5:30" suffix=" remaining" />
      <StatBadge variant="score" value={87} suffix="%" glow="subtle" />
      <StatBadge variant="score" value="A+" glow="subtle" />
    </div>
  ),
};

export const WithPrefixes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center justify-center">
      <StatBadge
        variant="xp"
        prefix="+"
        value={500}
        suffix=" XP"
        glow="subtle"
      />
      <StatBadge variant="streak" prefix="Day " value={22} glow="subtle" />
      <StatBadge variant="score" prefix="Level " value={15} glow="subtle" />
    </div>
  ),
};

export const AnimatedValues: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center justify-center">
      <StatBadge
        variant="xp"
        value={1250}
        suffix=" XP"
        animateValue
        glow="subtle"
      />
      <StatBadge
        variant="streak"
        value={22}
        suffix=" days"
        animateValue
        glow="subtle"
      />
      <StatBadge
        variant="score"
        value={95}
        suffix="%"
        animateValue
        glow="subtle"
      />
    </div>
  ),
};

export const ReducedMotion: Story = {
  args: {
    variant: "achievement",
    value: "Master",
    glow: "intense",
    disableAnimations: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Demonstrates how badges behave with animations disabled for accessibility.",
      },
    },
  },
};

export const Interactive: Story = {
  args: {
    variant: "xp",
    value: 2500,
    suffix: " XP",
    glow: "subtle",
    animateValue: true,
  },
  play: async ({ canvasElement }) => {
    const badge = canvasElement.querySelector("div");
    if (!badge) {
      throw new Error("StatBadge not found");
    }

    // Check badge content
    if (
      !badge.textContent?.includes("2500") &&
      !badge.textContent?.includes("2.5K")
    ) {
      throw new Error("Badge value not displayed correctly");
    }

    // Check for icon presence
    const icon = badge.querySelector("svg");
    if (!icon) {
      throw new Error("Badge icon not found");
    }
  },
};

export const GameDashboard: Story = {
  render: () => (
    <div className="p-6 bg-card/40 backdrop-blur-sm border border-border/40 rounded-lg space-y-4">
      <h3 className="text-lg font-semibold text-foreground mb-4">
        Player Stats
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatBadge variant="xp" value={15420} suffix=" XP" glow="subtle" />
        <StatBadge variant="streak" value={28} suffix=" days" glow="subtle" />
        <StatBadge variant="score" value={94} suffix="%" glow="subtle" />
        <StatBadge variant="achievement" value="Gold" glow="subtle" />
        <StatBadge variant="time" value={127} suffix=" hrs" />
        <StatBadge variant="difficulty" value="Expert" />
      </div>

      <div className="pt-2 border-t border-border/20">
        <h4 className="text-sm font-medium text-muted-foreground mb-2">
          Recent Achievements
        </h4>
        <div className="flex flex-wrap gap-2">
          <StatBadge
            variant="achievement"
            value="Speed Demon"
            size="sm"
            glow="subtle"
          />
          <StatBadge
            variant="achievement"
            value="Perfect Score"
            size="sm"
            glow="subtle"
          />
          <StatBadge
            variant="achievement"
            value="Consistency"
            size="sm"
            glow="subtle"
          />
        </div>
      </div>
    </div>
  ),
};
