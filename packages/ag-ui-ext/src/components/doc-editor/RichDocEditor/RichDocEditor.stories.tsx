import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { RichDocEditor } from "./RichDocEditor";

const meta: Meta<typeof RichDocEditor> = {
  title: "Docs/RichDocEditor",
  component: RichDocEditor,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "A Notion-style block editor built on BlockNote. Supports headings, lists, callouts, code blocks, and more.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    readOnly: { control: "boolean" },
    theme: { control: "select", options: ["light", "dark"] },
    disableAnimations: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Sample content for prepopulated story - using any[] to avoid BlockNote's strict typing
const sampleContent: any[] = [
  {
    type: "heading",
    props: { level: 1 },
    content: [{ type: "text", text: "Cardiac Physiology Overview" }],
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "The heart is a four-chambered muscular organ responsible for pumping blood throughout the body.",
      },
    ],
  },
  {
    type: "heading",
    props: { level: 2 },
    content: [{ type: "text", text: "Key Concepts" }],
  },
  {
    type: "bulletListItem",
    content: [{ type: "text", text: "Cardiac output = Stroke Volume × Heart Rate" }],
  },
  {
    type: "bulletListItem",
    content: [{ type: "text", text: "Preload: End-diastolic volume" }],
  },
  {
    type: "bulletListItem",
    content: [{ type: "text", text: "Afterload: Aortic pressure" }],
  },
];

/** Default empty editor */
export const Default: Story = {
  args: {
    placeholder: "Start writing your notes...",
    theme: "dark",
  },
};

/** Editor with prepopulated content */
export const Prepopulated: Story = {
  args: {
    initialContent: sampleContent,
    theme: "dark",
  },
};

/** Read-only mode */
export const ReadOnly: Story = {
  args: {
    initialContent: sampleContent,
    readOnly: true,
    theme: "dark",
  },
};

/** Light theme variant */
export const LightTheme: Story = {
  args: {
    initialContent: sampleContent,
    theme: "light",
  },
};

/** Interactive with state */
export const Interactive: Story = {
  render: (args) => {
    const [content, setContent] = useState<any[]>([]);

    return (
      <div className="space-y-4">
        <RichDocEditor {...args} onChange={setContent} />
        <details className="rounded border border-border/40 p-2">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            View JSON ({content.length} blocks)
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto text-xs">
            {JSON.stringify(content, null, 2)}
          </pre>
        </details>
      </div>
    );
  },
};
