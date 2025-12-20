import type { Meta, StoryObj } from "@storybook/react-vite";
import { MissionDocEditor } from "./MissionDocEditor";

const meta: Meta<typeof MissionDocEditor> = {
  title: "Docs/MissionDocEditor",
  component: MissionDocEditor,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Mission-focused document editor with templates for briefs, checklists, and reflections.",
      },
    },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const briefTemplate: any[] = [
  {
    type: "heading",
    props: { level: 1 },
    content: [{ type: "text", text: "Mission Brief" }],
  },
  {
    type: "heading",
    props: { level: 2 },
    content: [{ type: "text", text: "Objective" }],
  },
  {
    type: "paragraph",
    content: [{ type: "text", text: "Master the fundamentals of cardiac pharmacology." }],
  },
  {
    type: "heading",
    props: { level: 2 },
    content: [{ type: "text", text: "Success Criteria" }],
  },
  {
    type: "bulletListItem",
    content: [{ type: "text", text: "Complete 50 practice questions with 80%+ accuracy" }],
  },
  {
    type: "bulletListItem",
    content: [{ type: "text", text: "Create flashcards for all drug classes" }],
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reflectionTemplate: any[] = [
  {
    type: "heading",
    props: { level: 1 },
    content: [{ type: "text", text: "Mission Reflection" }],
  },
  {
    type: "heading",
    props: { level: 2 },
    content: [{ type: "text", text: "What went well?" }],
  },
  {
    type: "paragraph",
    content: [{ type: "text", text: "" }],
  },
  {
    type: "heading",
    props: { level: 2 },
    content: [{ type: "text", text: "What could improve?" }],
  },
  {
    type: "paragraph",
    content: [{ type: "text", text: "" }],
  },
];

/** Mission brief template */
export const MissionBrief: Story = {
  args: {
    missionTitle: "Cardiac Pharmacology Deep Dive",
    missionStatus: "active",
    template: "brief",
    templateContent: briefTemplate,
  },
};

/** Reflection mode */
export const ReflectionMode: Story = {
  args: {
    missionTitle: "Cardiac Pharmacology Deep Dive",
    missionStatus: "completed",
    template: "reflection",
    templateContent: reflectionTemplate,
  },
};

/** With template selector */
export const WithTemplateSelector: Story = {
  args: {
    missionTitle: "New Mission",
    missionStatus: "active",
    showTemplateSelector: true,
    template: "notes",
  },
};

/** Paused mission */
export const PausedMission: Story = {
  args: {
    missionTitle: "Step 2 CK Review",
    missionStatus: "paused",
    template: "notes",
  },
};
