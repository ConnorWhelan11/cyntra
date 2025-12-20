import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatBadge } from "../../atoms/StatBadge";
import { QuestCard } from "./QuestCard";

const meta: Meta<typeof QuestCard> = {
  title: "Molecules/QuestCard",
  component: QuestCard,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A cyberpunk-styled quest/mission card showing title, description, difficulty, progress, and XP rewards. Perfect for gamified learning interfaces with multiple states and interactive elements.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "completed", "locked", "featured"],
      description: "Card visual style variant",
    },
    size: {
      control: { type: "select" },
      options: ["default", "compact", "expanded"],
      description: "Card size",
    },
    title: {
      control: { type: "text" },
      description: "Quest title",
    },
    description: {
      control: { type: "text" },
      description: "Quest description",
    },
    rewardXP: {
      control: { type: "number" },
      description: "XP reward amount",
    },
    difficulty: {
      control: { type: "select" },
      options: ["Easy", "Medium", "Hard", "Expert"],
      description: "Difficulty level",
    },
    progress: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      description: "Progress from 0 to 1",
    },
    estimatedTime: {
      control: { type: "number" },
      description: "Estimated time in minutes",
    },
    status: {
      control: { type: "select" },
      options: ["available", "in-progress", "completed", "locked"],
      description: "Quest status",
    },
    showProgress: {
      control: { type: "boolean" },
      description: "Show progress bar",
    },
    featured: {
      control: { type: "boolean" },
      description: "Featured quest styling",
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
    title: "Master Organic Chemistry",
    description: "Complete 50 organic chemistry problems with 80% accuracy",
    rewardXP: 500,
    difficulty: "Medium",
    progress: 0.65,
    estimatedTime: 45,
    status: "in-progress",
    onClick: () => alert("Quest clicked!"),
  },
};

export const AllStatuses: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
      <QuestCard
        title="Available Quest"
        description="This quest is ready to start"
        rewardXP={250}
        difficulty="Easy"
        progress={0}
        estimatedTime={30}
        status="available"
        onClick={() => alert("Starting quest!")}
      />

      <QuestCard
        title="In Progress Quest"
        description="Currently working on this challenging quest"
        rewardXP={750}
        difficulty="Hard"
        progress={0.4}
        estimatedTime={60}
        status="in-progress"
        onClick={() => alert("Continue quest!")}
      />

      <QuestCard
        title="Completed Quest"
        description="Successfully completed with full rewards"
        rewardXP={500}
        difficulty="Medium"
        progress={1}
        estimatedTime={45}
        status="completed"
        onClick={() => alert("View results!")}
      />

      <QuestCard
        title="Locked Quest"
        description="Complete prerequisites to unlock this quest"
        rewardXP={1000}
        difficulty="Expert"
        progress={0}
        estimatedTime={90}
        status="locked"
      />
    </div>
  ),
};

export const AllDifficulties: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
      <QuestCard
        title="Basic Concepts"
        description="Learn fundamental principles"
        rewardXP={100}
        difficulty="Easy"
        progress={0.8}
        status="in-progress"
      />

      <QuestCard
        title="Intermediate Practice"
        description="Apply knowledge to solve problems"
        rewardXP={300}
        difficulty="Medium"
        progress={0.5}
        status="in-progress"
      />

      <QuestCard
        title="Advanced Scenarios"
        description="Tackle complex multi-step problems"
        rewardXP={600}
        difficulty="Hard"
        progress={0.2}
        status="in-progress"
      />

      <QuestCard
        title="Mastery Challenge"
        description="Demonstrate complete understanding"
        rewardXP={1200}
        difficulty="Expert"
        progress={0}
        status="available"
        featured
      />
    </div>
  ),
};

export const FeaturedQuests: Story = {
  render: () => (
    <div className="grid grid-cols-1 gap-4 max-w-md">
      <QuestCard
        title="Weekly Challenge"
        description="Complete 100 questions this week for bonus XP"
        rewardXP={2500}
        difficulty="Hard"
        progress={0.73}
        estimatedTime={180}
        status="in-progress"
        featured
        onClick={() => alert("Continue weekly challenge!")}
      />

      <QuestCard
        title="Perfect Score Streak"
        description="Get 10 perfect scores in a row"
        rewardXP={1500}
        difficulty="Expert"
        progress={0.6}
        estimatedTime={120}
        status="in-progress"
        featured
        onClick={() => alert("Continue streak challenge!")}
      />
    </div>
  ),
};

export const CompactLayout: Story = {
  render: () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-6xl">
      <QuestCard
        size="compact"
        title="Quick Review"
        rewardXP={150}
        difficulty="Easy"
        progress={0.9}
        status="in-progress"
        showProgress={false}
      />

      <QuestCard
        size="compact"
        title="Daily Practice"
        rewardXP={200}
        difficulty="Medium"
        progress={0.6}
        status="in-progress"
        showProgress={false}
      />

      <QuestCard
        size="compact"
        title="Speed Round"
        rewardXP={300}
        difficulty="Hard"
        progress={0.3}
        status="available"
        showProgress={false}
      />

      <QuestCard
        size="compact"
        title="Mastery Test"
        rewardXP={500}
        difficulty="Expert"
        progress={1}
        status="completed"
        showProgress={false}
      />

      <QuestCard
        size="compact"
        title="Advanced Topic"
        rewardXP={800}
        difficulty="Expert"
        progress={0}
        status="locked"
        showProgress={false}
      />

      <QuestCard
        size="compact"
        title="Bonus Challenge"
        rewardXP={1000}
        difficulty="Hard"
        progress={0.1}
        status="available"
        featured
        showProgress={false}
      />
    </div>
  ),
};

export const WithoutProgress: Story = {
  args: {
    title: "Knowledge Check",
    description: "Quick assessment of your understanding",
    rewardXP: 200,
    difficulty: "Medium",
    progress: 0.7,
    status: "available",
    showProgress: false,
    onClick: () => alert("Start knowledge check!"),
  },
};

export const ReducedMotion: Story = {
  args: {
    title: "Reduced Motion Quest",
    description: "This quest respects accessibility preferences",
    rewardXP: 400,
    difficulty: "Medium",
    progress: 0.5,
    status: "in-progress",
    featured: true,
    disableAnimations: true,
  },
};

export const Interactive: Story = {
  args: {
    title: "Interactive Quest",
    description: "Click to see interaction behavior",
    rewardXP: 350,
    difficulty: "Medium",
    progress: 0.4,
    estimatedTime: 25,
    status: "available",
    onClick: () => alert("Quest started!"),
  },
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector("div");
    if (!card) {
      throw new Error("QuestCard not found");
    }

    // Check title is rendered
    const title = card.querySelector("h3");
    if (!title || !title.textContent?.includes("Interactive Quest")) {
      throw new Error("Quest title not rendered correctly");
    }

    // Check XP badge is present
    const xpBadge = card.textContent?.includes("350 XP");
    if (!xpBadge) {
      throw new Error("XP reward not displayed");
    }

    // Check difficulty badge
    const difficultyBadge = card.textContent?.includes("Medium");
    if (!difficultyBadge) {
      throw new Error("Difficulty not displayed");
    }

    // Check progress bar
    const progressBar = card.querySelector("[style*='width']");
    if (!progressBar) {
      throw new Error("Progress bar not found");
    }
  },
};

export const QuestDashboard: Story = {
  render: () => (
    <div className="w-full max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Active Quests</h2>
        <StatBadge
          variant="streak"
          value={15}
          suffix=" day streak"
          glow="subtle"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <QuestCard
          title="MCAT Prep Marathon"
          description="Complete comprehensive practice across all subjects"
          rewardXP={5000}
          difficulty="Expert"
          progress={0.35}
          estimatedTime={300}
          status="in-progress"
          featured
          size="expanded"
        />

        <div className="space-y-3">
          <QuestCard
            title="Biology Mastery"
            description="Achieve 90% accuracy in biology questions"
            rewardXP={800}
            difficulty="Hard"
            progress={0.75}
            estimatedTime={90}
            status="in-progress"
          />

          <QuestCard
            title="Chemistry Fundamentals"
            description="Master basic chemistry concepts"
            rewardXP={600}
            difficulty="Medium"
            progress={1}
            estimatedTime={60}
            status="completed"
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-3">
          Quick Challenges
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuestCard
            size="compact"
            title="Speed Round"
            rewardXP={200}
            difficulty="Easy"
            progress={0}
            status="available"
            showProgress={false}
          />

          <QuestCard
            size="compact"
            title="Perfect Score"
            rewardXP={400}
            difficulty="Medium"
            progress={0.8}
            status="in-progress"
            showProgress={false}
          />

          <QuestCard
            size="compact"
            title="Time Trial"
            rewardXP={600}
            difficulty="Hard"
            progress={0}
            status="locked"
            showProgress={false}
          />

          <QuestCard
            size="compact"
            title="Bonus Round"
            rewardXP={1000}
            difficulty="Expert"
            progress={0}
            status="available"
            featured
            showProgress={false}
          />
        </div>
      </div>
    </div>
  ),
};
