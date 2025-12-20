import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { OutOfScopeScene } from "../OutOfScopeScene";
import { GlyphConsole3D } from "./GlyphConsole3D";

const meta = {
  title: "Three/GlyphConsole3D",
  component: GlyphConsole3D,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Returning user interface for OutOfScope. Replaces the standard ScopeBox with a cyberpunk console, avatar, and focus constellation.",
      },
    },
  },
  argTypes: {
    glyphState: {
      control: "select",
      options: ["idle", "listening", "thinking", "responding", "error"],
    },
    isTyping: { control: "boolean" },
    onPromptSubmit: { action: "submit" },
    onNodeClick: { action: "nodeClick" },
    onTodayClick: { action: "todayClick" },
  },
} satisfies Meta<typeof GlyphConsole3D>;

export default meta;
type Story = StoryObj<typeof meta>;

// --- Mocks ---

const mockSummary = {
  actIndex: 0,
  actCount: 4,
  nowLabel: "Hyperfocus Lab – Orgo",
  nextLabel: "MCAT review block @ 8pm",
};

const mockNodes = [
  { id: "m1", label: "Orgo Study", kind: "mission" as const, importance: 0.8 },
  {
    id: "l1",
    label: "Twitter Distraction",
    kind: "leak" as const,
    hasUnread: true,
  },
  { id: "c1", label: "Discord DM", kind: "comms" as const },
  { id: "m2", label: "Gym", kind: "mission" as const, importance: 0.4 },
  { id: "b1", label: "System Update", kind: "broadcast" as const },
];

const mockExchanges = [
  { id: "1", role: "user" as const, text: "What should I focus on?" },
  {
    id: "2",
    role: "glyph" as const,
    text: "Your energy is dipping. I suggest the 20min Orgo sprint.",
  },
  { id: "3", role: "user" as const, text: "Okay, load it up." },
];

// --- Wrapper ---

const ConsoleDemo = (props: React.ComponentProps<typeof GlyphConsole3D>) => {
  return (
    <div className="relative h-[640px] w-full overflow-hidden rounded-3xl border border-border/50 bg-black">
      <OutOfScopeScene
        pinToViewport={false}
        className="!min-h-[640px]"
        showPurpose={false}
        showLegend={false}
        sceneContent={<GlyphConsole3D {...props} />}
      />
    </div>
  );
};

// --- Stories ---

export const Default: Story = {
  render: (args) => <ConsoleDemo {...args} />,
  args: {
    todaySummary: mockSummary,
    constellationNodes: mockNodes.slice(0, 3),
    glyphState: "idle",
    isTyping: false,
    recentExchanges: [],
  },
};

export const Typing: Story = {
  render: (args) => <ConsoleDemo {...args} />,
  args: {
    ...Default.args,
    isTyping: true,
  },
};

export const Thinking: Story = {
  render: (args) => <ConsoleDemo {...args} />,
  args: {
    ...Default.args,
    glyphState: "thinking",
    recentExchanges: [
      { id: "1", role: "user" as const, text: "Analyze my last session." },
    ],
  },
};

export const Responding: Story = {
  render: (args) => <ConsoleDemo {...args} />,
  args: {
    ...Default.args,
    glyphState: "responding",
    recentExchanges: mockExchanges,
  },
};

export const BusyConstellation: Story = {
  render: (args) => <ConsoleDemo {...args} />,
  args: {
    ...Default.args,
    constellationNodes: [
      ...mockNodes,
      { id: "m3", label: "Sleep", kind: "mission" as const },
      { id: "l2", label: "YouTube", kind: "leak" as const },
    ],
  },
};

export const Interactive: Story = {
  render: (args) => {
    const [history, setHistory] = useState<typeof mockExchanges>([]);
    const [state, setState] = useState<typeof args.glyphState>("idle");
    const [typing, setTyping] = useState(false);

    const handleSubmit = (text: string) => {
      setHistory((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "user", text },
      ]);
      setState("thinking");
      setTyping(false);

      setTimeout(() => {
        setState("responding");
        setHistory((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "glyph",
            text: "Acknowledged. Proceeding with protocol.",
          },
        ]);
        setTimeout(() => setState("idle"), 2000);
      }, 1500);
    };

    return (
      <ConsoleDemo
        {...args}
        recentExchanges={history}
        glyphState={state}
        isTyping={typing} // In a real app, this might be derived from focus/input state
        onPromptSubmit={handleSubmit}
      />
    );
  },
  args: {
    ...Default.args,
    todaySummary: { ...mockSummary, nowLabel: "Interactive Demo" },
  },
};

