import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { GlowButton } from "../../atoms/GlowButton";
import { CommandPalette, defaultCommands, type CommandPaletteItem } from "./CommandPalette";

const meta: Meta<typeof CommandPalette> = {
  title: "Organisms/CommandPalette",
  component: CommandPalette,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A powerful command palette using cmdk for fuzzy search and keyboard navigation. Features grouped commands, shortcuts, recent items, and customizable actions.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "dark", "light"],
      description: "Command palette visual style variant",
    },
    placeholder: {
      control: { type: "text" },
      description: "Search input placeholder",
    },
    emptyText: {
      control: { type: "text" },
      description: "Text shown when no results found",
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

const studyCommands: CommandPaletteItem[] = [
  ...defaultCommands,
  {
    id: "biology-practice",
    title: "Biology Practice Questions",
    description: "Start practicing biology questions",
    icon: <span className="text-green-500">🧬</span>,
    group: "Subjects",
    keywords: ["biology", "practice", "questions", "cells"],
    action: () => alert("Starting Biology practice!"),
  },
  {
    id: "chemistry-formulas",
    title: "Chemistry Formula Review",
    description: "Review important chemical formulas",
    icon: <span className="text-blue-500">⚗️</span>,
    group: "Subjects",
    keywords: ["chemistry", "formulas", "review", "equations"],
    action: () => alert("Opening Chemistry formulas!"),
  },
  {
    id: "physics-calculations",
    title: "Physics Calculations",
    description: "Practice physics problem solving",
    icon: <span className="text-purple-500">⚛️</span>,
    group: "Subjects",
    keywords: ["physics", "calculations", "problems", "math"],
    action: () => alert("Starting Physics calculations!"),
  },
  {
    id: "mcsa-questions",
    title: "MCAT-Style Questions",
    description: "Practice official MCAT-style questions",
    icon: <span className="text-orange-500">📝</span>,
    group: "Practice",
    keywords: ["mcat", "official", "practice", "exam"],
    action: () => alert("Starting MCAT practice!"),
  },
  {
    id: "weak-areas",
    title: "Focus on Weak Areas",
    description: "Target topics that need improvement",
    icon: <span className="text-red-500">🎯</span>,
    group: "Study",
    keywords: ["weak", "areas", "focus", "improvement"],
    action: () => alert("Focusing on weak areas!"),
  },
];

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-md mx-auto space-y-4">
          <h2 className="text-2xl font-bold text-foreground">Command Palette Demo</h2>
          <p className="text-muted-foreground">
            Click the button below or press ⌘+K to open the command palette.
          </p>

          <GlowButton variant="default" glow="low" onClick={() => setOpen(true)} className="w-full">
            Open Command Palette
          </GlowButton>
        </div>

        <CommandPalette
          open={open}
          onOpenChange={setOpen}
          items={studyCommands}
          recentCommands={["practice", "tutor", "dashboard"]}
        />
      </div>
    );
  },
};

export const WithCustomCommands: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    const customCommands: CommandPaletteItem[] = [
      {
        id: "create-note",
        title: "Create New Note",
        description: "Add a new study note",
        icon: <span className="text-blue-500">📝</span>,
        shortcut: ["⌘", "N"],
        group: "Actions",
        action: () => alert("Creating new note!"),
      },
      {
        id: "search-notes",
        title: "Search Notes",
        description: "Find existing study notes",
        icon: <span className="text-green-500">🔍</span>,
        shortcut: ["⌘", "F"],
        group: "Search",
        action: () => alert("Searching notes!"),
      },
      {
        id: "export-data",
        title: "Export Study Data",
        description: "Download your study progress",
        icon: <span className="text-purple-500">📊</span>,
        group: "Data",
        action: () => alert("Exporting data!"),
      },
      {
        id: "invite-friend",
        title: "Invite Study Buddy",
        description: "Share with a friend",
        icon: <span className="text-pink-500">👥</span>,
        group: "Social",
        action: () => alert("Inviting friend!"),
      },
    ];

    return (
      <div className="min-h-screen bg-background p-8">
        <GlowButton variant="default" glow="low" onClick={() => setOpen(true)}>
          Custom Commands
        </GlowButton>

        <CommandPalette
          open={open}
          onOpenChange={setOpen}
          items={customCommands}
          placeholder="What would you like to do?"
        />
      </div>
    );
  },
};

export const WithFooter: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <div className="min-h-screen bg-background p-8">
        <GlowButton variant="default" glow="low" onClick={() => setOpen(true)}>
          With Footer
        </GlowButton>

        <CommandPalette
          open={open}
          onOpenChange={setOpen}
          items={studyCommands}
          footer={
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Use ↑↓ to navigate, ↵ to select, ⎋ to close</span>
              <span>12 commands available</span>
            </div>
          }
        />
      </div>
    );
  },
};

export const DarkVariant: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <div className="min-h-screen bg-background p-8">
        <GlowButton variant="default" glow="low" onClick={() => setOpen(true)}>
          Dark Variant
        </GlowButton>

        <CommandPalette open={open} onOpenChange={setOpen} items={studyCommands} variant="dark" />
      </div>
    );
  },
};

export const LightVariant: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <div className="min-h-screen bg-background p-8">
        <GlowButton variant="default" glow="low" onClick={() => setOpen(true)}>
          Light Variant
        </GlowButton>

        <CommandPalette open={open} onOpenChange={setOpen} items={studyCommands} variant="light" />
      </div>
    );
  },
};

export const Loading: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <div className="min-h-screen bg-background p-8">
        <GlowButton variant="default" glow="low" onClick={() => setOpen(true)}>
          Loading State
        </GlowButton>

        <CommandPalette open={open} onOpenChange={setOpen} items={studyCommands} loading={true} />
      </div>
    );
  },
};

export const EmptyResults: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <div className="min-h-screen bg-background p-8">
        <GlowButton variant="default" glow="low" onClick={() => setOpen(true)}>
          Search for &quot;xyz&quot;
        </GlowButton>

        <CommandPalette
          open={open}
          onOpenChange={setOpen}
          items={studyCommands}
          emptyText="No commands found. Try searching for something else."
        />
      </div>
    );
  },
};

export const ReducedMotion: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <div className="min-h-screen bg-background p-8">
        <GlowButton variant="default" glow="low" onClick={() => setOpen(true)}>
          Reduced Motion
        </GlowButton>

        <CommandPalette
          open={open}
          onOpenChange={setOpen}
          items={studyCommands}
          disableAnimations={true}
        />
      </div>
    );
  },
};

export const Interactive: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const [selectedCommand, setSelectedCommand] = useState<string>("");

    const commandsWithTracking = studyCommands.map((command) => ({
      ...command,
      action: () => {
        setSelectedCommand(command.title);
        command.action();
      },
    }));

    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-md mx-auto space-y-4">
          <h2 className="text-2xl font-bold text-foreground">Interactive Demo</h2>
          {selectedCommand && (
            <p className="text-muted-foreground">
              Last selected: <strong>{selectedCommand}</strong>
            </p>
          )}

          <GlowButton variant="default" glow="low" onClick={() => setOpen(true)} className="w-full">
            Open Interactive Palette
          </GlowButton>

          <p className="text-xs text-muted-foreground">
            Try typing to search commands, use arrow keys to navigate, and press Enter to select.
          </p>
        </div>

        <CommandPalette
          open={open}
          onOpenChange={setOpen}
          items={commandsWithTracking}
          placeholder="Search commands... (try 'practice' or 'biology')"
        />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector("button");
    if (!button) {
      throw new Error("Open button not found");
    }

    // Test that palette can be opened
    const palette = canvasElement.querySelector("[class*='fixed inset-0']");
    if (!palette) {
      throw new Error("Palette container not found");
    }
  },
};
