import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ExplanationPanel } from "./ExplanationPanel";

const meta: Meta<typeof ExplanationPanel> = {
  title: "Organisms/ExplanationPanel",
  component: ExplanationPanel,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "A comprehensive explanation panel for displaying detailed answers, diagrams, formulas, and step-by-step reasoning for practice questions and learning materials.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "success", "warning", "destructive"],
      description: "Panel visual style variant",
    },
    size: {
      control: { type: "select" },
      options: ["default", "compact", "expanded"],
      description: "Panel size",
    },
    expanded: {
      control: { type: "boolean" },
      description: "Whether panel is expanded",
    },
    showClose: {
      control: { type: "boolean" },
      description: "Show close button",
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

const sampleExplanationItems = [
  {
    id: "1",
    type: "text" as const,
    title: "Correct Answer",
    content:
      "The mitochondria is the powerhouse of the cell because it is responsible for generating ATP (adenosine triphosphate) through cellular respiration.",
  },
  {
    id: "2",
    type: "bullet" as const,
    title: "Key Points",
    content:
      "ATP is the energy currency of the cell\nMitochondria contain enzymes for the Krebs cycle and electron transport chain\nThe inner membrane creates a proton gradient for ATP synthesis\nMitochondria have their own DNA and ribosomes",
  },
  {
    id: "3",
    type: "diagram" as const,
    title: "Cellular Respiration Overview",
    content:
      "This diagram shows the process of cellular respiration from glucose to ATP production.",
    imageUrl: "https://via.placeholder.com/400x200/4f46e5/ffffff?text=Cellular+Respiration+Diagram",
    imageAlt: "Diagram showing cellular respiration process",
  },
  {
    id: "4",
    type: "formula" as const,
    title: "ATP Production Formula",
    content: "C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + 38ATP",
  },
  {
    id: "5",
    type: "tip" as const,
    content:
      "Remember: The mitochondria is often called the 'powerhouse' because it converts chemical energy from food into a form the cell can use (ATP).",
  },
];

export const Default: Story = {
  args: {
    title: "Question Explanation",
    items: sampleExplanationItems,
  },
};

export const ChemistryExplanation: Story = {
  args: {
    title: "SN2 Reaction Mechanism",
    variant: "success",
    items: [
      {
        id: "1",
        type: "text" as const,
        content:
          "The SN2 reaction is a type of nucleophilic substitution where the nucleophile attacks the carbon atom from the opposite side of the leaving group in a single step.",
      },
      {
        id: "2",
        type: "bullet" as const,
        title: "SN2 Characteristics",
        content:
          "One-step mechanism\nBackside attack (inversion of configuration)\nSecond-order kinetics (rate = k[Nu][R-LG])\nFavored by good nucleophiles and leaving groups\nSteric hindrance decreases reaction rate",
      },
      {
        id: "3",
        type: "diagram" as const,
        title: "SN2 Reaction Coordinate",
        content: "Energy diagram showing the single transition state for SN2 reactions.",
        imageUrl: "https://via.placeholder.com/400x200/059669/ffffff?text=SN2+Reaction+Diagram",
        imageAlt: "SN2 reaction energy diagram",
      },
      {
        id: "4",
        type: "formula" as const,
        title: "General SN2 Reaction",
        content: "Nu⁻ + R-LG → R-Nu + LG⁻",
      },
      {
        id: "5",
        type: "tip" as const,
        content:
          "SN2 reactions are favored in primary alkyl halides and methyl halides due to minimal steric hindrance.",
      },
    ],
  },
};

export const MathExplanation: Story = {
  args: {
    title: "Solving Quadratic Equations",
    variant: "default",
    items: [
      {
        id: "1",
        type: "text" as const,
        title: "Quadratic Formula",
        content:
          "The quadratic formula is used to solve equations of the form ax² + bx + c = 0, where a, b, and c are constants and a ≠ 0.",
      },
      {
        id: "2",
        type: "formula" as const,
        content: "x = [-b ± √(b² - 4ac)] / (2a)",
      },
      {
        id: "3",
        type: "bullet" as const,
        title: "Steps to Use the Formula",
        content:
          "Identify coefficients a, b, and c\nCalculate the discriminant (b² - 4ac)\nTake square root of discriminant\nApply the ± operator\nDivide by 2a",
      },
      {
        id: "4",
        type: "diagram" as const,
        title: "Discriminant Cases",
        content: "The discriminant determines the nature of the roots.",
        imageUrl: "https://via.placeholder.com/400x200/dc2626/ffffff?text=Discriminant+Cases",
        imageAlt: "Diagram showing discriminant cases",
      },
      {
        id: "5",
        type: "warning" as const,
        content:
          "Remember to check if the discriminant is negative - this indicates complex roots requiring imaginary numbers.",
      },
    ],
  },
};

export const Compact: Story = {
  args: {
    size: "compact",
    title: "Quick Explanation",
    items: [
      {
        id: "1",
        type: "text" as const,
        content:
          "Photosynthesis is the process by which plants convert light energy into chemical energy stored in glucose.",
      },
      {
        id: "2",
        type: "formula" as const,
        content: "6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂",
      },
    ],
  },
};

export const Expanded: Story = {
  args: {
    size: "expanded",
    title: "Comprehensive Analysis",
    items: [
      ...sampleExplanationItems,
      {
        id: "6",
        type: "text" as const,
        title: "Clinical Relevance",
        content:
          "Understanding mitochondrial function is crucial in medicine. Mitochondrial diseases can cause various symptoms including muscle weakness, neurological problems, and organ dysfunction. The mitochondrial genome is inherited maternally.",
      },
      {
        id: "7",
        type: "bullet" as const,
        title: "Related Medical Conditions",
        content:
          "MELAS syndrome (mitochondrial encephalomyopathy)\nLeber's hereditary optic neuropathy\nKearns-Sayre syndrome\nChronic progressive external ophthalmoplegia",
      },
    ],
  },
};

export const Interactive: Story = {
  render: () => {
    const [expanded, setExpanded] = useState(true);
    const [showClose, setShowClose] = useState(false);

    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={expanded}
              onChange={(e) => setExpanded(e.target.checked)}
            />
            Expanded
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showClose}
              onChange={(e) => setShowClose(e.target.checked)}
            />
            Show Close Button
          </label>
        </div>

        <ExplanationPanel
          title="Interactive Explanation"
          items={sampleExplanationItems}
          expanded={expanded}
          onExpandedChange={setExpanded}
          showClose={showClose}
          onClose={() => alert("Panel closed!")}
        />
      </div>
    );
  },
};

export const Loading: Story = {
  args: {
    title: "Generating Explanation...",
    items: [],
    loading: true,
  },
};

export const WithCustomHeader: Story = {
  args: {
    title: "Custom Header Example",
    items: sampleExplanationItems.slice(0, 2),
    headerContent: (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Question 5 of 20</span>
        <span>•</span>
        <span>Time: 2:34</span>
      </div>
    ),
    footerContent: (
      <div className="flex items-center justify-between">
        <button className="text-sm text-cyan-neon hover:underline">Report Issue</button>
        <div className="flex gap-2">
          <button className="px-3 py-1 text-sm border border-border rounded hover:bg-accent">
            Previous
          </button>
          <button className="px-3 py-1 text-sm bg-cyan-neon text-cyan-neon-foreground rounded hover:bg-cyan-neon/90">
            Next Question
          </button>
        </div>
      </div>
    ),
  },
};

export const HighlightedItems: Story = {
  args: {
    title: "Key Concepts Highlighted",
    items: [
      {
        id: "1",
        type: "text" as const,
        content: "This is a regular explanation item.",
      },
      {
        id: "2",
        type: "text" as const,
        content: "This is a highlighted item that draws attention to important information.",
        highlight: true,
      },
      {
        id: "3",
        type: "tip" as const,
        content: "Another highlighted tip for emphasis.",
        highlight: true,
      },
      {
        id: "4",
        type: "text" as const,
        content: "Back to regular content.",
      },
    ],
  },
};

export const ReducedMotion: Story = {
  args: {
    title: "No Animations",
    items: sampleExplanationItems,
    disableAnimations: true,
  },
};
