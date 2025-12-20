import type { Meta, StoryObj } from "@storybook/react-vite";
import { Calendar, Clock, Target } from "lucide-react";
import { DashboardHero } from "./DashboardHero";

const meta: Meta<typeof DashboardHero> = {
  title: "Organisms/DashboardHero",
  component: DashboardHero,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A comprehensive dashboard hero section with central HUD ring, quick stats, CTAs, and animated background elements. Perfect for landing pages and dashboard overviews.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "dark", "neon"],
      description: "Visual style variant",
    },
    size: {
      control: { type: "select" },
      options: ["default", "compact", "expanded"],
      description: "Hero section size",
    },
    readinessPercentage: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      description: "HUD ring value (0-1)",
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
    title: "Welcome back to your MCAT Journey",
    subtitle: "Ready to continue your medical school preparation?",
    readinessPercentage: 0.75,
    readinessLabel: "Study Readiness",
    primaryActionText: "Start Session",
    secondaryActionText: "View Progress",
    stats: [
      {
        label: "Days to MCAT",
        value: "47",
        icon: <Calendar className="h-4 w-4" />,
        trend: "neutral",
      },
      {
        label: "Hours Studied",
        value: "127",
        icon: <Clock className="h-4 w-4" />,
        trend: "up",
        trendValue: "+12%",
      },
      {
        label: "Weakest Subject",
        value: "Physics",
        icon: <Target className="h-4 w-4" />,
        trend: "down",
      },
    ],
    onPrimaryAction: () => alert("Starting study session!"),
    onSecondaryAction: () => alert("Viewing progress!"),
  },
};

export const HighReadiness: Story = {
  args: {
    title: "Excellent Progress!",
    subtitle: "You're well-prepared for your upcoming MCAT",
    readinessPercentage: 0.95,
    readinessLabel: "Study Readiness",
    primaryActionText: "Take Practice Test",
    stats: [
      {
        label: "Days to MCAT",
        value: "15",
        icon: <Calendar className="h-4 w-4" />,
        trend: "neutral",
      },
      {
        label: "Hours Studied",
        value: "234",
        icon: <Clock className="h-4 w-4" />,
        trend: "up",
        trendValue: "+8%",
      },
      {
        label: "Average Score",
        value: "89%",
        icon: <Target className="h-4 w-4" />,
        trend: "up",
        trendValue: "+5%",
      },
    ],
  },
};

export const LowReadiness: Story = {
  args: {
    title: "Let's Get Started!",
    subtitle: "Begin your MCAT preparation journey today",
    readinessPercentage: 0.15,
    readinessLabel: "Study Readiness",
    primaryActionText: "Begin Journey",
    secondaryActionText: "Learn More",
    stats: [
      {
        label: "Days to MCAT",
        value: "120",
        icon: <Calendar className="h-4 w-4" />,
        trend: "neutral",
      },
      {
        label: "Hours Studied",
        value: "0",
        icon: <Clock className="h-4 w-4" />,
        trend: "neutral",
      },
      {
        label: "Topics Covered",
        value: "0/50",
        icon: <Target className="h-4 w-4" />,
        trend: "neutral",
      },
    ],
  },
};

export const DarkVariant: Story = {
  args: {
    variant: "dark",
    title: "Focus Mode Activated",
    subtitle: "Distraction-free study environment",
    readinessPercentage: 0.85,
    readinessLabel: "Focus Level",
    primaryActionText: "Enter Focus Mode",
    stats: [
      {
        label: "Session Time",
        value: "25m",
        icon: <Clock className="h-4 w-4" />,
        trend: "up",
        trendValue: "+10m",
      },
      {
        label: "Questions",
        value: "45",
        icon: <Target className="h-4 w-4" />,
        trend: "up",
        trendValue: "+15",
      },
      {
        label: "Accuracy",
        value: "92%",
        icon: <Calendar className="h-4 w-4" />,
        trend: "up",
        trendValue: "+3%",
      },
    ],
  },
};

export const NeonVariant: Story = {
  args: {
    variant: "neon",
    title: "Achievement Unlocked!",
    subtitle: "You've reached a new milestone",
    readinessPercentage: 0.9,
    readinessLabel: "Progress Level",
    primaryActionText: "Continue Learning",
    stats: [
      {
        label: "XP Earned",
        value: "2500",
        icon: <Target className="h-4 w-4" />,
        trend: "up",
        trendValue: "+500",
      },
      {
        label: "Streak",
        value: "15 days",
        icon: <Clock className="h-4 w-4" />,
        trend: "up",
        trendValue: "+3",
      },
      {
        label: "Badges",
        value: "8",
        icon: <Calendar className="h-4 w-4" />,
        trend: "up",
        trendValue: "+2",
      },
    ],
  },
};

export const Compact: Story = {
  args: {
    size: "compact",
    title: "Quick Study Session",
    subtitle: "Jump back into your learning",
    readinessPercentage: 0.6,
    primaryActionText: "Resume",
    stats: [
      {
        label: "Progress",
        value: "60%",
        icon: <Target className="h-4 w-4" />,
      },
      {
        label: "Time Left",
        value: "15m",
        icon: <Clock className="h-4 w-4" />,
      },
    ],
  },
};

export const Expanded: Story = {
  args: {
    size: "expanded",
    title: "Welcome to Your Personalized Learning Dashboard",
    subtitle:
      "Track your progress, earn achievements, and master the MCAT with AI-powered study tools",
    readinessPercentage: 0.8,
    readinessLabel: "Overall Readiness",
    primaryActionText: "Explore Study Plans",
    secondaryActionText: "View Achievements",
    stats: [
      {
        label: "Study Streak",
        value: "28",
        icon: <Calendar className="h-4 w-4" />,
        trend: "up",
        trendValue: "+7",
      },
      {
        label: "Questions Answered",
        value: "1247",
        icon: <Target className="h-4 w-4" />,
        trend: "up",
        trendValue: "+89",
      },
      {
        label: "Average Score",
        value: "87%",
        icon: <Clock className="h-4 w-4" />,
        trend: "up",
        trendValue: "+2%",
      },
      {
        label: "Time Studied",
        value: "156h",
        icon: <Calendar className="h-4 w-4" />,
        trend: "up",
        trendValue: "+12h",
      },
      {
        label: "Topics Mastered",
        value: "23/50",
        icon: <Target className="h-4 w-4" />,
        trend: "up",
        trendValue: "+3",
      },
      {
        label: "Achievements",
        value: "12",
        icon: <Clock className="h-4 w-4" />,
        trend: "up",
        trendValue: "+2",
      },
    ],
  },
};

export const ReducedMotion: Story = {
  args: {
    title: "Welcome Back",
    subtitle: "No animations for accessibility",
    readinessPercentage: 0.7,
    disableAnimations: true,
    stats: [
      {
        label: "Progress",
        value: "70%",
        icon: <Target className="h-4 w-4" />,
      },
      {
        label: "Sessions",
        value: "45",
        icon: <Clock className="h-4 w-4" />,
      },
    ],
  },
};

export const CustomContent: Story = {
  args: {
    title: "Custom Dashboard",
    subtitle: "With custom central content",
    centralContent: (
      <div className="relative">
        <div className="w-48 h-48 bg-gradient-to-br from-cyan-neon/20 to-emerald-neon/20 rounded-full flex items-center justify-center border-4 border-cyan-neon/40">
          <div className="text-center">
            <div className="text-4xl font-bold text-cyan-neon mb-2">85%</div>
            <div className="text-sm text-muted-foreground">Custom Metric</div>
          </div>
        </div>
        {/* Animated ring around custom content */}
        <div
          className="absolute inset-0 rounded-full border-2 border-cyan-neon/30 animate-spin"
          style={{ animationDuration: "8s" }}
        />
      </div>
    ),
    primaryActionText: "View Details",
    stats: [
      {
        label: "Custom Stat 1",
        value: "42",
        trend: "up",
        trendValue: "+10%",
      },
      {
        label: "Custom Stat 2",
        value: "73%",
        trend: "neutral",
      },
    ],
  },
};

export const StudySessionStart: Story = {
  args: {
    title: "Ready for Today's Study Session?",
    subtitle:
      "Based on your learning pattern, we've prepared 25 questions covering organic chemistry and physics",
    readinessPercentage: 0.82,
    readinessLabel: "Today's Readiness",
    primaryActionText: "Start 25-Minute Session",
    secondaryActionText: "Customize Session",
    stats: [
      {
        label: "Today's Goal",
        value: "25 min",
        icon: <Clock className="h-4 w-4" />,
      },
      {
        label: "Questions",
        value: "20-25",
        icon: <Target className="h-4 w-4" />,
      },
      {
        label: "Focus Areas",
        value: "2",
        icon: <Calendar className="h-4 w-4" />,
        trend: "up",
        trendValue: "O-Chem, Physics",
      },
    ],
    onPrimaryAction: () => alert("Starting study session!"),
    onSecondaryAction: () => alert("Customizing session!"),
  },
};

export const AchievementCelebration: Story = {
  args: {
    variant: "neon",
    title: "🎉 Congratulations!",
    subtitle:
      "You've just completed your first perfect week with 100% accuracy across all subjects!",
    readinessPercentage: 1.0,
    readinessLabel: "Perfect Week!",
    primaryActionText: "Claim Reward",
    secondaryActionText: "Share Achievement",
    stats: [
      {
        label: "Perfect Week",
        value: "✅",
        icon: <Target className="h-4 w-4" />,
        trend: "up",
        trendValue: "First time!",
      },
      {
        label: "XP Bonus",
        value: "+500",
        icon: <Clock className="h-4 w-4" />,
        trend: "up",
        trendValue: "Weekly reward",
      },
      {
        label: "Streak",
        value: "7 days",
        icon: <Calendar className="h-4 w-4" />,
        trend: "up",
        trendValue: "🔥",
      },
    ],
  },
};
