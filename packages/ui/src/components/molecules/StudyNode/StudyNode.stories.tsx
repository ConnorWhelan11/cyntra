import type { Meta, StoryObj } from "@storybook/react-vite";
import { StudyNode } from "./StudyNode";

const meta: Meta<typeof StudyNode> = {
  title: "Molecules/StudyNode",
  component: StudyNode,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A timeline node component for study plans with popover details. Shows topic, time estimate, difficulty, and interactive popover with learning objectives and prerequisites. Perfect for study timeline interfaces.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "featured"],
      description: "Node visual style variant",
    },
    size: {
      control: { type: "select" },
      options: ["sm", "default", "lg"],
      description: "Node size",
    },
    topic: {
      control: { type: "text" },
      description: "Study topic name",
    },
    subject: {
      control: { type: "select" },
      options: [
        "Biology",
        "Chemistry",
        "Physics",
        "Psychology",
        "Sociology",
        "Critical Analysis",
      ],
      description: "Subject category",
    },
    estimatedTime: {
      control: { type: "number" },
      description: "Estimated time in minutes",
    },
    difficulty: {
      control: { type: "select" },
      options: ["Easy", "Medium", "Hard", "Expert"],
      description: "Difficulty level",
    },
    status: {
      control: { type: "select" },
      options: ["upcoming", "available", "in-progress", "completed", "locked"],
      description: "Node status",
    },
    progress: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      description: "Progress for in-progress items",
    },
    position: {
      control: { type: "select" },
      options: ["first", "middle", "last"],
      description: "Position in timeline",
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
    topic: "Cell Biology",
    subject: "Biology",
    estimatedTime: 45,
    difficulty: "Medium",
    status: "available",
    description: "Study the fundamental structures and functions of cells",
    objectives: [
      "Understand cell membrane structure and function",
      "Learn about organelles and their roles",
      "Master cellular respiration processes",
    ],
    onStart: () => alert("Starting Cell Biology session!"),
  },
};

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-col gap-8 items-center">
      <StudyNode
        topic="Upcoming Topic"
        subject="Chemistry"
        estimatedTime={30}
        difficulty="Easy"
        status="upcoming"
        position="first"
        description="This topic will be available soon"
      />

      <StudyNode
        topic="Available Topic"
        subject="Biology"
        estimatedTime={45}
        difficulty="Medium"
        status="available"
        description="Ready to start studying"
        objectives={[
          "Learn key concepts",
          "Practice problems",
          "Review material",
        ]}
        onStart={() => alert("Starting session!")}
      />

      <StudyNode
        topic="In Progress"
        subject="Physics"
        estimatedTime={60}
        difficulty="Hard"
        status="in-progress"
        progress={0.6}
        description="Currently studying this topic"
        onStart={() => alert("Continuing session!")}
      />

      <StudyNode
        topic="Completed Topic"
        subject="Psychology"
        estimatedTime={40}
        difficulty="Medium"
        status="completed"
        progress={1}
        description="Successfully completed with full understanding"
      />

      <StudyNode
        topic="Locked Topic"
        subject="Chemistry"
        estimatedTime={90}
        difficulty="Expert"
        status="locked"
        position="last"
        description="Complete prerequisites to unlock"
        prerequisites={["Basic Chemistry", "Organic Chemistry I"]}
      />
    </div>
  ),
};

export const TimelineSample: Story = {
  render: () => (
    <div className="flex flex-col gap-0 items-center py-8">
      <StudyNode
        topic="Cell Structure"
        subject="Biology"
        estimatedTime={30}
        difficulty="Easy"
        status="completed"
        position="first"
        description="Basic cell components and organization"
      />

      <StudyNode
        topic="Cellular Respiration"
        subject="Biology"
        estimatedTime={45}
        difficulty="Medium"
        status="in-progress"
        progress={0.7}
        description="Energy production in cells"
        objectives={[
          "Understand glycolysis pathway",
          "Learn Krebs cycle",
          "Master electron transport chain",
        ]}
        onStart={() => alert("Continue studying!")}
      />

      <StudyNode
        topic="Photosynthesis"
        subject="Biology"
        estimatedTime={50}
        difficulty="Medium"
        status="available"
        description="Light and dark reactions in plants"
        prerequisites={["Cell Structure", "Cellular Respiration"]}
        objectives={[
          "Light-dependent reactions",
          "Calvin cycle",
          "Factors affecting photosynthesis",
        ]}
        onStart={() => alert("Start photosynthesis!")}
      />

      <StudyNode
        topic="Advanced Metabolism"
        subject="Biology"
        estimatedTime={75}
        difficulty="Hard"
        status="locked"
        position="last"
        description="Complex metabolic pathways and regulation"
        prerequisites={["Cellular Respiration", "Photosynthesis"]}
      />
    </div>
  ),
};

export const DifferentSubjects: Story = {
  render: () => (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-8 items-start">
      <StudyNode
        topic="Genetics"
        subject="Biology"
        estimatedTime={60}
        difficulty="Hard"
        status="available"
        description="DNA, RNA, and inheritance patterns"
      />

      <StudyNode
        topic="Organic Reactions"
        subject="Chemistry"
        estimatedTime={90}
        difficulty="Expert"
        status="in-progress"
        progress={0.3}
        description="Mechanisms and synthesis pathways"
      />

      <StudyNode
        topic="Thermodynamics"
        subject="Physics"
        estimatedTime={75}
        difficulty="Hard"
        status="available"
        description="Heat, work, and energy transfer"
      />

      <StudyNode
        topic="Cognitive Psychology"
        subject="Psychology"
        estimatedTime={50}
        difficulty="Medium"
        status="completed"
        description="Memory, learning, and perception"
      />

      <StudyNode
        topic="Social Theory"
        subject="Sociology"
        estimatedTime={40}
        difficulty="Medium"
        status="available"
        description="Society structures and interactions"
      />

      <StudyNode
        topic="Research Methods"
        subject="Critical Analysis"
        estimatedTime={55}
        difficulty="Hard"
        status="locked"
        description="Scientific methodology and analysis"
      />
    </div>
  ),
};

export const FeaturedNodes: Story = {
  render: () => (
    <div className="flex flex-col gap-8 items-center">
      <StudyNode
        variant="featured"
        topic="MCAT Prep Intensive"
        subject="Biology"
        estimatedTime={120}
        difficulty="Expert"
        status="available"
        description="Comprehensive review of all MCAT biology topics"
        objectives={[
          "Master all biological systems",
          "Practice high-yield questions",
          "Review common misconceptions",
          "Timed practice sessions",
        ]}
        onStart={() => alert("Starting intensive session!")}
      />

      <StudyNode
        variant="featured"
        topic="Weak Area Focus"
        subject="Chemistry"
        estimatedTime={90}
        difficulty="Hard"
        status="in-progress"
        progress={0.4}
        description="Targeted practice for your weakest chemistry topics"
        onStart={() => alert("Continue focused practice!")}
      />
    </div>
  ),
};

export const ReducedMotion: Story = {
  args: {
    topic: "Reduced Motion Node",
    subject: "Biology",
    estimatedTime: 45,
    difficulty: "Medium",
    status: "available",
    disableAnimations: true,
  },
};

export const Interactive: Story = {
  args: {
    topic: "Interactive Node",
    subject: "Chemistry",
    estimatedTime: 60,
    difficulty: "Hard",
    status: "available",
    description: "Click to see popover details",
    objectives: ["Learn concepts", "Practice problems", "Review material"],
    onStart: () => alert("Session started!"),
  },
  play: async ({ canvasElement }) => {
    const node = canvasElement.querySelector("button");
    if (!node) {
      throw new Error("StudyNode button not found");
    }

    // Check node is accessible
    if (node.disabled && node.textContent?.includes("Interactive")) {
      throw new Error("Interactive node should not be disabled");
    }

    // Check icon is present
    const icon = node.querySelector("svg");
    if (!icon) {
      throw new Error("StudyNode icon not found");
    }
  },
};
