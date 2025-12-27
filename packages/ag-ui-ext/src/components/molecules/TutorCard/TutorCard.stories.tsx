import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { TutorCard } from "./TutorCard";

const meta: Meta<typeof TutorCard> = {
  title: "Molecules/TutorCard",
  component: TutorCard,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "An AI tutor response card that displays agent messages with text, bullet points, mini-charts, and action buttons. Perfect for conversational AI interfaces with rich content presentation.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "suggestion", "explanation", "warning", "insight"],
      description: "Card visual style variant",
    },
    size: {
      control: { type: "select" },
      options: ["default", "compact", "expanded"],
      description: "Card size",
    },
    type: {
      control: { type: "select" },
      options: [
        "text",
        "suggestion",
        "explanation",
        "warning",
        "insight",
        "chart",
        "progress",
        "flashcard",
        "quiz",
        "steps",
      ],
      description: "Card type (determines icon and auto-variant)",
    },
    title: {
      control: { type: "text" },
      description: "Card title",
    },
    content: {
      control: { type: "text" },
      description: "Main content text",
    },
    agentName: {
      control: { type: "text" },
      description: "Agent name",
    },
    timestamp: {
      control: { type: "text" },
      description: "Message timestamp",
    },
    loading: {
      control: { type: "boolean" },
      description: "Loading state",
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
    type: "text",
    content:
      "I notice you're struggling with organic chemistry reactions. Let me help you understand the key mechanisms.",
    agentName: "Chemistry Tutor",
    timestamp: "2 minutes ago",
  },
};

export const AllTypes: Story = {
  render: () => (
    <div className="space-y-4 max-w-2xl">
      <TutorCard
        type="text"
        content="Here's a general explanation of the concept you asked about."
        agentName="AI Tutor"
        timestamp="Just now"
      />

      <TutorCard
        type="suggestion"
        title="Study Recommendation"
        content="Based on your recent performance, I suggest focusing on these areas:"
        bulletPoints={[
          "Review acid-base equilibrium concepts",
          "Practice buffer calculations",
          "Study common organic reaction mechanisms",
        ]}
        agentName="Study Advisor"
        timestamp="5 minutes ago"
        actions={[
          {
            label: "Start Practice",
            onClick: () => alert("Starting practice!"),
          },
          {
            label: "Learn More",
            onClick: () => alert("Learning more!"),
            variant: "outline",
          },
        ]}
      />

      <TutorCard
        type="explanation"
        title="Concept Breakdown"
        content="Let me break down this complex topic into manageable parts:"
        bulletPoints={[
          "First, understand the basic principle",
          "Then, see how it applies to different scenarios",
          "Finally, practice with real examples",
        ]}
        agentName="Concept Tutor"
        timestamp="10 minutes ago"
      />

      <TutorCard
        type="warning"
        title="Common Mistake Alert"
        content="I've noticed you're making a common error in this type of problem. Here's how to avoid it."
        agentName="Error Detector"
        timestamp="15 minutes ago"
      />

      <TutorCard
        type="insight"
        title="Performance Insight"
        content="Your accuracy has improved significantly in this area! You're ready for more challenging problems."
        chartData={[
          { label: "Week 1", value: 65 },
          { label: "Week 2", value: 72 },
          { label: "Week 3", value: 78 },
          { label: "Week 4", value: 85 },
        ]}
        agentName="Progress Analyzer"
        timestamp="1 hour ago"
        actions={[
          { label: "View Details", onClick: () => alert("Viewing details!") },
          { label: "Next Level", onClick: () => alert("Advancing!") },
        ]}
      />
    </div>
  ),
};

export const WithChartData: Story = {
  args: {
    type: "chart",
    title: "Performance Analysis",
    content: "Here's how your scores have changed over the past week:",
    chartData: [
      { label: "Biology", value: 87 },
      { label: "Chemistry", value: 72 },
      { label: "Physics", value: 68 },
      { label: "Psychology", value: 91 },
    ],
    agentName: "Analytics Bot",
    timestamp: "30 minutes ago",
    actions: [
      { label: "Detailed Report", onClick: () => alert("Generating report!") },
      {
        label: "Focus Areas",
        onClick: () => alert("Showing focus areas!"),
        variant: "outline",
      },
    ],
  },
};

export const ConversationFlow: Story = {
  render: () => (
    <div className="space-y-3 max-w-2xl">
      <TutorCard
        type="text"
        content="I see you're working on organic chemistry. What specific topic would you like help with?"
        agentName="Chemistry Tutor"
        timestamp="5 minutes ago"
      />

      <div className="pl-8">
        <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm">
          I&apos;m confused about nucleophilic substitution reactions.
        </div>
      </div>

      <TutorCard
        type="explanation"
        title="Nucleophilic Substitution"
        content="Great question! Let me explain the two main types of nucleophilic substitution:"
        bulletPoints={[
          "SN1: Two-step mechanism with carbocation intermediate",
          "SN2: One-step mechanism with backside attack",
          "Substrate structure determines which mechanism dominates",
        ]}
        agentName="Chemistry Tutor"
        timestamp="3 minutes ago"
        actions={[
          {
            label: "Practice Problems",
            onClick: () => alert("Starting practice!"),
          },
          {
            label: "Visual Guide",
            onClick: () => alert("Showing diagrams!"),
            variant: "outline",
          },
        ]}
      />

      <TutorCard
        type="suggestion"
        title="Next Steps"
        content="Now that you understand the basics, here's what I recommend:"
        bulletPoints={[
          "Complete 10 practice problems on SN1 vs SN2",
          "Review stereochemistry effects",
          "Study real-world examples in drug synthesis",
        ]}
        agentName="Study Planner"
        timestamp="Just now"
        actions={[{ label: "Start Practice", onClick: () => alert("Starting!") }]}
      />
    </div>
  ),
};

export const LoadingStates: Story = {
  render: () => (
    <div className="space-y-4 max-w-2xl">
      <TutorCard type="text" content="Analyzing your question..." loading agentName="AI Tutor" />

      <TutorCard
        type="insight"
        title="Generating Insights"
        content="Processing your performance data to provide personalized recommendations..."
        loading
        agentName="Analytics Bot"
      />
    </div>
  ),
};

export const CompactLayout: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl">
      <TutorCard
        size="compact"
        type="suggestion"
        content="Try focusing on this area for better results."
        agentName="Quick Tip"
      />

      <TutorCard
        size="compact"
        type="explanation"
        content="This concept builds on what you learned yesterday."
        agentName="Concept Link"
      />

      <TutorCard
        size="compact"
        type="warning"
        content="Watch out for this common mistake."
        agentName="Error Guard"
      />

      <TutorCard
        size="compact"
        type="insight"
        content="You're making great progress in this subject!"
        agentName="Progress Bot"
      />
    </div>
  ),
};

export const ReducedMotion: Story = {
  args: {
    type: "insight",
    title: "Reduced Motion Card",
    content: "This card respects accessibility preferences and shows no animations.",
    agentName: "Accessible Tutor",
    disableAnimations: true,
  },
};

export const Interactive: Story = {
  args: {
    type: "suggestion",
    title: "Interactive Card",
    content: "Click this card to see interaction behavior.",
    agentName: "Interactive Bot",
    timestamp: "Now",
    onClick: () => alert("Card clicked!"),
    actions: [
      { label: "Primary Action", onClick: () => alert("Primary!") },
      {
        label: "Secondary",
        onClick: () => alert("Secondary!"),
        variant: "outline",
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector("div");
    if (!card) {
      throw new Error("TutorCard not found");
    }

    // Check content is rendered
    if (!card.textContent?.includes("Interactive Card")) {
      throw new Error("Card content not rendered");
    }

    // Check agent name is displayed
    if (!card.textContent?.includes("Interactive Bot")) {
      throw new Error("Agent name not displayed");
    }

    // Check action buttons are present
    const buttons = card.querySelectorAll("button");
    if (buttons.length < 2) {
      throw new Error("Action buttons not found");
    }
  },
};

export const Flashcard: Story = {
  args: {
    type: "flashcard",
    title: "Organic Chemistry Flashcard",
    content: "Test your knowledge of reaction mechanisms",
    flashcardData: {
      front: "What is the rate-determining step in an SN1 reaction?",
      back: "The formation of the carbocation intermediate",
      flipped: false,
    },
    actions: [
      {
        label: "Flip Card",
        onClick: () => console.log("Flip flashcard"),
      },
      {
        label: "Next Card",
        onClick: () => console.log("Next flashcard"),
      },
    ],
  },
};

export const FlashcardFlipped: Story = {
  args: {
    type: "flashcard",
    title: "Organic Chemistry Flashcard",
    content: "Answer revealed!",
    flashcardData: {
      front: "What is the rate-determining step in an SN1 reaction?",
      back: "The formation of the carbocation intermediate",
      flipped: true,
    },
    actions: [
      {
        label: "Flip Back",
        onClick: () => console.log("Flip back"),
      },
      {
        label: "Mark Correct",
        onClick: () => console.log("Mark as correct"),
      },
    ],
  },
};

export const QuizCard: Story = {
  args: {
    type: "quiz",
    title: "Quick Quiz",
    content: "Test your understanding",
    quizData: {
      question: "Which of the following is NOT a characteristic of enzymes?",
      options: [
        "They are proteins",
        "They speed up chemical reactions",
        "They are consumed in the reaction",
        "They have active sites",
      ],
      correctAnswer: 2,
      explanation:
        "Enzymes are biological catalysts that are not consumed in the reactions they catalyze. They can be used repeatedly.",
    },
    actions: [
      {
        label: "Submit Answer",
        onClick: () => console.log("Submit quiz answer"),
      },
      {
        label: "Show Explanation",
        onClick: () => console.log("Show explanation"),
        variant: "outline",
      },
    ],
  },
};

export const StepByStepGuide: Story = {
  args: {
    type: "steps",
    title: "Solving Quadratic Equations",
    content: "Follow these steps to solve any quadratic equation",
    stepsData: [
      {
        title: "Identify coefficients",
        description: "Find the values of a, b, and c in ax² + bx + c = 0",
        completed: true,
      },
      {
        title: "Calculate discriminant",
        description: "Use the formula D = b² - 4ac",
        completed: true,
      },
      {
        title: "Apply quadratic formula",
        description: "x = [-b ± √(D)] / (2a)",
        completed: false,
      },
      {
        title: "Check solutions",
        description: "Substitute back into original equation",
        completed: false,
      },
    ],
    actions: [
      {
        label: "Practice Now",
        onClick: () => console.log("Start practice"),
      },
    ],
  },
};

export const InteractiveFlashcard: Story = {
  render: () => {
    const [flipped, setFlipped] = React.useState(false);

    return (
      <div className="space-y-4">
        <TutorCard
          type="flashcard"
          title="Interactive Flashcard"
          content={flipped ? "Click to flip back" : "Click to reveal answer"}
          flashcardData={{
            front: "What is the formula for the area of a circle?",
            back: "A = πr²",
            flipped,
          }}
          onClick={() => setFlipped(!flipped)}
          actions={[
            {
              label: flipped ? "Flip Back" : "Reveal Answer",
              onClick: () => setFlipped(!flipped),
            },
          ]}
        />

        <div className="text-sm text-muted-foreground text-center">
          Click the card or button to flip
        </div>
      </div>
    );
  },
};

export const StudySessionSteps: Story = {
  args: {
    type: "steps",
    title: "MCAT Study Session Plan",
    content: "Complete these steps for an effective study session",
    stepsData: [
      {
        title: "Review previous material",
        description: "Spend 15 minutes reviewing yesterday's topics",
        completed: true,
      },
      {
        title: "Active learning phase",
        description: "Work through practice questions for 45 minutes",
        completed: true,
      },
      {
        title: "Break and review",
        description: "Take a 10-minute break, then review mistakes",
        completed: false,
      },
      {
        title: "New material",
        description: "Learn 2-3 new concepts with active recall",
        completed: false,
      },
      {
        title: "Session review",
        description: "Summarize key points and plan next session",
        completed: false,
      },
    ],
    actions: [
      {
        label: "Mark Step Complete",
        onClick: () => console.log("Mark step as complete"),
      },
      {
        label: "End Session",
        onClick: () => console.log("End study session"),
        variant: "outline",
      },
    ],
  },
};

export const ComprehensiveTutorResponse: Story = {
  render: () => (
    <div className="space-y-4 max-w-2xl">
      <TutorCard
        type="text"
        title="Welcome to your study session!"
        content="I've prepared a comprehensive review session for organic chemistry. We'll cover reaction mechanisms, functional groups, and practice problems."
        agentName="AI Study Assistant"
        timestamp="2 minutes ago"
      />

      <TutorCard
        type="steps"
        title="Today's Study Plan"
        content="Follow this structured approach for maximum retention"
        stepsData={[
          {
            title: "Warm-up Review",
            description: "Quick review of basic concepts",
            completed: true,
          },
          {
            title: "Deep Dive",
            description: "Detailed explanation of mechanisms",
            completed: false,
          },
          {
            title: "Practice Problems",
            description: "Apply concepts to real scenarios",
            completed: false,
          },
        ]}
      />

      <TutorCard
        type="quiz"
        title="Knowledge Check"
        content="Let's start with a quick assessment"
        quizData={{
          question: "Which mechanism involves a carbocation intermediate?",
          options: ["SN2", "E1", "SN1", "E2"],
          correctAnswer: 2,
        }}
      />

      <TutorCard
        type="flashcard"
        title="Key Concept Review"
        content="Test your understanding of reaction kinetics"
        flashcardData={{
          front: "What determines reaction rate in SN2 reactions?",
          back: "Nucleophile strength and substrate structure",
          flipped: false,
        }}
        actions={[
          {
            label: "Flip Card",
            onClick: () => console.log("Flip"),
          },
        ]}
      />

      <TutorCard
        type="insight"
        title="Study Tip"
        content="Remember: SN1 reactions favor tertiary substrates because they form more stable carbocation intermediates. This is a key differentiator from SN2 reactions."
        bulletPoints={[
          "Tertiary > Secondary > Primary stability",
          "Polar protic solvents stabilize carbocations",
          "Rate depends only on substrate concentration",
        ]}
      />
    </div>
  ),
};
