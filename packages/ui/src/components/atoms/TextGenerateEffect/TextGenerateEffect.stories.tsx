import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextGenerateEffect } from "./TextGenerateEffect";

const meta = {
  title: "Atoms/TextGenerateEffect",
  component: TextGenerateEffect,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    words: {
      control: "text",
      description: "The text to animate",
    },
    duration: {
      control: "number",
      description: "Duration of the animation per word",
    },
    filter: {
      control: "boolean",
      description: "Whether to apply a blur filter",
    },
  },
} satisfies Meta<typeof TextGenerateEffect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    words: "Oxygen gets you high. In a catastrophic emergency, we're taking giant, panicked breaths. Suddenly you become euphoric, docile. You accept your fate.",
    filter: true,
    duration: 0.5,
  },
};

export const Fast: Story = {
  args: {
    words: "This text generates much faster than the default speed.",
    filter: true,
    duration: 0.1,
  },
};

export const NoBlur: Story = {
  args: {
    words: "This text appears without the blur effect.",
    filter: false,
    duration: 0.5,
  },
};

