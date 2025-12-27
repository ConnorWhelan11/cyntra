import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { StudyTimeline } from "./StudyTimeline";

const meta: Meta<typeof StudyTimeline> = {
  title: "Organisms/StudyTimeline",
  component: StudyTimeline,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "A chronological timeline component for displaying study sessions, achievements, milestones, and progress over time with animated reveals and interactive elements.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "compact", "expanded"],
      description: "Timeline visual style variant",
    },
    orientation: {
      control: { type: "select" },
      options: ["vertical", "horizontal"],
      description: "Timeline orientation",
    },
    showLine: {
      control: { type: "boolean" },
      description: "Show connecting timeline line",
    },
    groupByDate: {
      control: { type: "boolean" },
      description: "Group items by date",
    },
    expandableItems: {
      control: { type: "boolean" },
      description: "Make items expandable",
    },
    showDetails: {
      control: { type: "boolean" },
      description: "Show item details",
    },
    showLoadMore: {
      control: { type: "boolean" },
      description: "Show load more button",
    },
    loading: {
      control: { type: "boolean" },
      description: "Loading state",
    },
    disableAnimations: {
      control: { type: "boolean" },
      description: "Disable animations",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const sampleTimelineItems = [
  {
    id: "1",
    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Yesterday
    title: "Advanced Organic Chemistry",
    description: "Completed nucleophilic substitution reactions practice set",
    type: "study" as const,
    status: "completed" as const,
    duration: 45,
    xpEarned: 150,
    subjects: ["Organic Chemistry"],
    difficulty: "Hard" as const,
    achievements: ["Speed Demon"],
  },
  {
    id: "2",
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    title: "Physics Milestone Reached",
    description: "Completed 100 physics questions with 90% accuracy",
    type: "milestone" as const,
    status: "completed" as const,
    xpEarned: 500,
    subjects: ["Physics"],
    achievements: ["Century Club", "Accuracy Master"],
  },
  {
    id: "3",
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    title: "Weekly Study Streak",
    description: "7 consecutive days of study completed",
    type: "achievement" as const,
    status: "completed" as const,
    xpEarned: 300,
    achievements: ["Week Warrior"],
  },
  {
    id: "4",
    date: new Date(), // Today
    title: "Biology Practice Session",
    description: "Currently working on cellular respiration",
    type: "study" as const,
    status: "in-progress" as const,
    duration: 30,
    subjects: ["Biology"],
    difficulty: "Medium" as const,
  },
  {
    id: "5",
    date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Tomorrow
    title: "MCAT Practice Exam",
    description: "Full-length practice test scheduled",
    type: "exam" as const,
    status: "upcoming" as const,
    duration: 180,
  },
  {
    id: "6",
    date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    title: "Study Break",
    description: "Scheduled rest day for recovery",
    type: "break" as const,
    status: "upcoming" as const,
    duration: 480, // 8 hours
  },
];

export const Default: Story = {
  args: {
    items: sampleTimelineItems,
    showDetails: true,
  },
};

export const Compact: Story = {
  args: {
    variant: "compact",
    items: sampleTimelineItems,
    showDetails: false,
  },
};

export const Expanded: Story = {
  args: {
    variant: "expanded",
    items: sampleTimelineItems,
    expandableItems: true,
    showDetails: true,
  },
};

export const Horizontal: Story = {
  args: {
    orientation: "horizontal",
    items: sampleTimelineItems.slice(0, 4),
    showLine: false,
  },
  parameters: {
    layout: "fullscreen",
  },
};

export const GroupedByDate: Story = {
  args: {
    items: sampleTimelineItems,
    groupByDate: true,
    showDetails: true,
  },
};

export const NoLine: Story = {
  args: {
    items: sampleTimelineItems,
    showLine: false,
    showDetails: true,
  },
};

export const ExpandableItems: Story = {
  args: {
    items: sampleTimelineItems,
    expandableItems: true,
    showDetails: true,
  },
};

export const WithLoadMore: Story = {
  render: () => {
    const [maxItems, setMaxItems] = useState(3);

    const extendedItems = Array.from({ length: 20 }, (_, i) => ({
      id: `${i + 1}`,
      date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
      title: `Study Session ${i + 1}`,
      description: `Completed practice questions for topic ${i + 1}`,
      type: "study" as const,
      status:
        i < 3 ? ("completed" as const) : i < 5 ? ("in-progress" as const) : ("upcoming" as const),
      duration: 30 + Math.floor(Math.random() * 60),
      xpEarned: Math.floor(Math.random() * 200) + 50,
      subjects: ["Chemistry", "Biology", "Physics"][Math.floor(Math.random() * 3)],
      difficulty: ["Easy", "Medium", "Hard"][Math.floor(Math.random() * 3)] as const,
    }));

    return (
      <StudyTimeline
        items={extendedItems}
        maxItems={maxItems}
        showLoadMore={true}
        onLoadMore={() => setMaxItems((prev) => prev + 3)}
      />
    );
  },
};

export const AchievementFocused: Story = {
  args: {
    items: [
      {
        id: "1",
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        title: "Perfect Score Achievement",
        description: "Achieved 100% on advanced practice test",
        type: "achievement" as const,
        status: "completed" as const,
        xpEarned: 1000,
        achievements: ["Perfect Score", "Advanced Mastery"],
      },
      {
        id: "2",
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        title: "Study Streak: 30 Days",
        description: "Consecutive daily study achievement",
        type: "achievement" as const,
        status: "completed" as const,
        xpEarned: 750,
        achievements: ["Consistency King", "Dedication Award"],
      },
      {
        id: "3",
        date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        title: "Subject Mastery: Chemistry",
        description: "Completed all chemistry topics with 95%+ accuracy",
        type: "milestone" as const,
        status: "completed" as const,
        xpEarned: 2000,
        subjects: ["Chemistry"],
        achievements: ["Subject Expert", "Comprehensive Coverage"],
      },
    ],
    showDetails: true,
  },
};

export const ExamTimeline: Story = {
  args: {
    items: [
      {
        id: "1",
        date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        title: "MCAT Study Begins",
        description: "Started comprehensive MCAT preparation",
        type: "milestone" as const,
        status: "completed" as const,
        xpEarned: 100,
      },
      {
        id: "2",
        date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        title: "Practice Exam 1",
        description: "Completed first full-length practice exam",
        type: "exam" as const,
        status: "completed" as const,
        duration: 180,
        xpEarned: 300,
      },
      {
        id: "3",
        date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        title: "Chemistry Section Focus",
        description: "Intensive study of chemistry topics",
        type: "study" as const,
        status: "completed" as const,
        duration: 240,
        subjects: ["Chemistry"],
      },
      {
        id: "4",
        date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        title: "Practice Exam 2",
        description: "Second practice exam with improved performance",
        type: "exam" as const,
        status: "completed" as const,
        duration: 180,
        xpEarned: 350,
      },
      {
        id: "5",
        date: new Date(),
        title: "Final Review Week",
        description: "Comprehensive review of all MCAT topics",
        type: "study" as const,
        status: "in-progress" as const,
        duration: 300,
      },
      {
        id: "6",
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        title: "MCAT Exam Day",
        description: "Official MCAT examination",
        type: "exam" as const,
        status: "upcoming" as const,
        duration: 420,
      },
    ],
    showDetails: true,
    groupByDate: false,
  },
};

export const Minimal: Story = {
  args: {
    items: sampleTimelineItems.map((item) => ({
      ...item,
      description: undefined,
      duration: undefined,
      xpEarned: undefined,
      subjects: undefined,
      achievements: undefined,
    })),
    showDetails: false,
    showLine: true,
  },
};

export const ReducedMotion: Story = {
  args: {
    items: sampleTimelineItems,
    disableAnimations: true,
    showDetails: true,
  },
};

export const Interactive: Story = {
  args: {
    items: sampleTimelineItems,
    expandableItems: true,
    showDetails: true,
    onItemClick: (item) => alert(`Clicked: ${item.title}`),
  },
  play: async ({ canvasElement }) => {
    // Test that timeline renders with items
    const timeline = canvasElement.querySelector("[class*='StudyTimeline']");
    if (!timeline) {
      throw new Error("Timeline not found");
    }

    const items = timeline.querySelectorAll("[class*='flex gap-4']");
    if (items.length < 3) {
      throw new Error("Timeline items not rendered");
    }
  },
};
