import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { PracticeQuestionCard } from "./PracticeQuestionCard";

const meta: Meta<typeof PracticeQuestionCard> = {
  title: "Organisms/PracticeQuestionCard",
  component: PracticeQuestionCard,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "A comprehensive question card component with stem, multiple choice options, feedback states, timer, and explanation system. Features neon charge animations for correct/incorrect feedback.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    state: {
      control: { type: "select" },
      options: ["default", "selected", "correct", "incorrect", "disabled"],
      description: "Question state",
    },
    size: {
      control: { type: "select" },
      options: ["default", "compact", "expanded"],
      description: "Card size",
    },
    type: {
      control: { type: "select" },
      options: ["multiple-choice", "true-false", "short-answer"],
      description: "Question type",
    },
    difficulty: {
      control: { type: "select" },
      options: ["Easy", "Medium", "Hard", "Expert"],
      description: "Difficulty level",
    },
    showExplanation: {
      control: { type: "boolean" },
      description: "Show explanation",
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

const sampleQuestion = {
  question: "Which of the following is the correct mechanism for the SN2 reaction?",
  choices: [
    {
      id: "a",
      text: "Two-step mechanism with carbocation intermediate",
      explanation: "This describes the SN1 mechanism, not SN2.",
    },
    {
      id: "b",
      text: "One-step mechanism with backside attack",
      explanation:
        "Correct! SN2 reactions occur in a single step where the nucleophile attacks from the opposite side of the leaving group.",
    },
    {
      id: "c",
      text: "Two-step mechanism with no intermediate",
      explanation: "This is not a valid description of either SN1 or SN2 mechanisms.",
    },
    {
      id: "d",
      text: "One-step mechanism with frontside attack",
      explanation: "SN2 reactions involve backside attack, not frontside attack.",
    },
  ],
  correctAnswerId: "b",
};

export const Default: Story = {
  args: {
    question: sampleQuestion.question,
    choices: sampleQuestion.choices,
    subject: "Organic Chemistry",
    difficulty: "Medium",
    questionNumber: 1,
    totalQuestions: 10,
    timeLimit: 60,
  },
};

export const CorrectAnswer: Story = {
  args: {
    question: sampleQuestion.question,
    choices: sampleQuestion.choices,
    correctAnswerId: sampleQuestion.correctAnswerId,
    selectedAnswerId: "b",
    state: "correct",
    subject: "Organic Chemistry",
    difficulty: "Medium",
    showExplanation: true,
  },
};

export const IncorrectAnswer: Story = {
  args: {
    question: sampleQuestion.question,
    choices: sampleQuestion.choices,
    correctAnswerId: sampleQuestion.correctAnswerId,
    selectedAnswerId: "a",
    state: "incorrect",
    subject: "Organic Chemistry",
    difficulty: "Medium",
    showExplanation: true,
  },
};

export const Interactive: Story = {
  render: () => {
    const [selectedAnswerId, setSelectedAnswerId] = useState<string | undefined>();
    const [state, setState] = useState<"default" | "correct" | "incorrect">("default");
    const [showExplanation, setShowExplanation] = useState(false);

    const handleChoiceSelect = (choiceId: string) => {
      setSelectedAnswerId(choiceId);
    };

    const handleSubmit = () => {
      if (selectedAnswerId === sampleQuestion.correctAnswerId) {
        setState("correct");
      } else {
        setState("incorrect");
      }
    };

    const handleNext = () => {
      setSelectedAnswerId(undefined);
      setState("default");
      setShowExplanation(false);
    };

    return (
      <PracticeQuestionCard
        question={sampleQuestion.question}
        choices={sampleQuestion.choices}
        correctAnswerId={sampleQuestion.correctAnswerId}
        selectedAnswerId={selectedAnswerId}
        state={state}
        subject="Organic Chemistry"
        difficulty="Medium"
        questionNumber={1}
        totalQuestions={10}
        timeLimit={60}
        showExplanation={showExplanation}
        onChoiceSelect={handleChoiceSelect}
        onSubmit={handleSubmit}
        onNext={handleNext}
        onExplanationToggle={() => setShowExplanation(!showExplanation)}
      />
    );
  },
};

export const TrueFalse: Story = {
  args: {
    question: "The SN2 reaction requires a good leaving group.",
    choices: [
      {
        id: "true",
        text: "True",
        explanation:
          "Correct! SN2 reactions do require good leaving groups for the reaction to proceed.",
      },
      {
        id: "false",
        text: "False",
        explanation: "Incorrect. SN2 reactions do require good leaving groups.",
      },
    ],
    type: "true-false",
    subject: "Organic Chemistry",
    difficulty: "Easy",
    correctAnswerId: "true",
    selectedAnswerId: "true",
    state: "correct",
    showExplanation: true,
  },
};

export const WithTimer: Story = {
  args: {
    question: "Quick! Which element has atomic number 6?",
    choices: [
      { id: "h", text: "Hydrogen" },
      { id: "c", text: "Carbon" },
      { id: "n", text: "Nitrogen" },
      { id: "o", text: "Oxygen" },
    ],
    correctAnswerId: "c",
    subject: "Chemistry",
    difficulty: "Easy",
    timeLimit: 30,
    questionNumber: 5,
    totalQuestions: 20,
  },
};

export const Loading: Story = {
  args: {
    question: "Processing your answer...",
    choices: [
      { id: "a", text: "Option A" },
      { id: "b", text: "Option B" },
      { id: "c", text: "Option C" },
      { id: "d", text: "Option D" },
    ],
    subject: "General",
    difficulty: "Medium",
    loading: true,
  },
};

export const Disabled: Story = {
  args: {
    question: "This question is disabled for review purposes.",
    choices: [
      { id: "a", text: "Option A" },
      { id: "b", text: "Option B" },
      { id: "c", text: "Option C" },
      { id: "d", text: "Option D" },
    ],
    subject: "Review",
    difficulty: "Medium",
    state: "disabled",
  },
};

export const Compact: Story = {
  args: {
    size: "compact",
    question: "What is the capital of France?",
    choices: [
      { id: "london", text: "London" },
      { id: "paris", text: "Paris" },
      { id: "rome", text: "Rome" },
      { id: "berlin", text: "Berlin" },
    ],
    correctAnswerId: "paris",
    selectedAnswerId: "paris",
    state: "correct",
    subject: "Geography",
    difficulty: "Easy",
    showExplanation: true,
  },
};

export const Expanded: Story = {
  args: {
    size: "expanded",
    question:
      "Explain the mechanism of enzyme catalysis in detail, including the role of the active site, transition state stabilization, and catalytic strategies.",
    choices: [
      {
        id: "a",
        text: "Enzymes work by providing an alternative reaction pathway with lower activation energy through specific binding and stabilization of the transition state.",
        explanation:
          "This is the most comprehensive explanation covering all key aspects of enzyme catalysis.",
      },
      {
        id: "b",
        text: "Enzymes speed up reactions by heating the reactants.",
        explanation:
          "Incorrect. Enzymes do not work by heating reactants; they work through specific molecular interactions.",
      },
      {
        id: "c",
        text: "Enzymes are consumed during the reaction and must be replenished.",
        explanation: "Incorrect. Enzymes are catalysts and are not consumed during the reaction.",
      },
      {
        id: "d",
        text: "Enzymes work by increasing the concentration of reactants.",
        explanation:
          "Partially correct but not the primary mechanism. The main mechanism involves lowering activation energy.",
      },
    ],
    correctAnswerId: "a",
    selectedAnswerId: "a",
    state: "correct",
    subject: "Biochemistry",
    difficulty: "Expert",
    showExplanation: true,
  },
};

export const ReducedMotion: Story = {
  args: {
    question: "What is 2 + 2?",
    choices: [
      { id: "3", text: "3" },
      { id: "4", text: "4" },
      { id: "5", text: "5" },
      { id: "6", text: "6" },
    ],
    correctAnswerId: "4",
    selectedAnswerId: "4",
    state: "correct",
    subject: "Math",
    difficulty: "Easy",
    disableAnimations: true,
  },
};

export const QuestionSequence: Story = {
  render: () => {
    const questions = [
      {
        question: "What is the powerhouse of the cell?",
        choices: [
          { id: "nucleus", text: "Nucleus" },
          { id: "mitochondria", text: "Mitochondria" },
          { id: "ribosome", text: "Ribosome" },
          { id: "golgi", text: "Golgi Apparatus" },
        ],
        correctAnswerId: "mitochondria",
      },
      {
        question: "Which of these is NOT a noble gas?",
        choices: [
          { id: "he", text: "Helium" },
          { id: "ne", text: "Neon" },
          { id: "ar", text: "Argon" },
          { id: "cl", text: "Chlorine" },
        ],
        correctAnswerId: "cl",
      },
    ];

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedAnswerId, setSelectedAnswerId] = useState<string | undefined>();
    const [state, setState] = useState<"default" | "correct" | "incorrect">("default");

    const currentQuestion = questions[currentQuestionIndex];

    const handleChoiceSelect = (choiceId: string) => {
      setSelectedAnswerId(choiceId);
    };

    const handleSubmit = () => {
      if (selectedAnswerId === currentQuestion.correctAnswerId) {
        setState("correct");
      } else {
        setState("incorrect");
      }
    };

    const handleNext = () => {
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex((prev) => prev + 1);
        setSelectedAnswerId(undefined);
        setState("default");
      } else {
        alert("Quiz completed!");
      }
    };

    return (
      <PracticeQuestionCard
        question={currentQuestion.question}
        choices={currentQuestion.choices}
        correctAnswerId={currentQuestion.correctAnswerId}
        selectedAnswerId={selectedAnswerId}
        state={state}
        subject="Science"
        difficulty="Medium"
        questionNumber={currentQuestionIndex + 1}
        totalQuestions={questions.length}
        onChoiceSelect={handleChoiceSelect}
        onSubmit={handleSubmit}
        onNext={handleNext}
      />
    );
  },
};
