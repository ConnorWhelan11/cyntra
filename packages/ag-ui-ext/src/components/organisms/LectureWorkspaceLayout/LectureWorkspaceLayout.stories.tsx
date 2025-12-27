import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  LectureWorkspaceLayout,
  WorkspaceLayoutMode,
  WorkspaceFocusPanel,
} from "./LectureWorkspaceLayout";

/**
 * LectureWorkspaceLayout is a composite component for lecture sessions that
 * combines notes, drawboard, and comms panels in configurable layouts.
 */
const meta: Meta<typeof LectureWorkspaceLayout> = {
  title: "Organisms/LectureWorkspaceLayout",
  component: LectureWorkspaceLayout,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A flexible workspace for lectures combining BlockNote editor, draw.io canvas, and communication panels. Supports split, tabbed, and focus layouts.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    layout: {
      control: "radio",
      options: ["split", "tabbed", "focus"],
    },
    focusPanel: {
      control: "radio",
      options: ["drawboard", "notes", "comms"],
    },
    showDrawboard: {
      control: "boolean",
    },
    showNotes: {
      control: "boolean",
    },
    showComms: {
      control: "boolean",
    },
  },
  decorators: [
    (Story) => (
      <div className="h-screen bg-background p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof LectureWorkspaceLayout>;

/**
 * Default split layout with drawboard and notes side-by-side.
 */
export const SplitLayout: Story = {
  args: {
    lectureId: "lecture-001",
    lectureTitle: "Cardiac Physiology - Heart Mechanics",
    showDrawboard: true,
    showNotes: true,
    showComms: false,
    layout: "split",
  },
};

/**
 * Tabbed layout for switching between panels.
 */
export const TabbedLayout: Story = {
  args: {
    lectureId: "lecture-002",
    lectureTitle: "Respiratory System Overview",
    showDrawboard: true,
    showNotes: true,
    showComms: true,
    layout: "tabbed",
    focusPanel: "notes",
  },
};

/**
 * Focus layout with one panel maximized and others minimized in a rail.
 */
export const FocusLayout: Story = {
  args: {
    lectureId: "lecture-003",
    lectureTitle: "Neuroanatomy - Cranial Nerves",
    showDrawboard: true,
    showNotes: true,
    showComms: true,
    layout: "focus",
    focusPanel: "notes",
  },
};

/**
 * Live lecture simulation with timestamp.
 */
export const LiveLecture: Story = {
  args: {
    lectureId: "lecture-live",
    lectureTitle: "🔴 LIVE: Pharmacokinetics",
    currentTimestamp: 1847, // 30:47
    showDrawboard: true,
    showNotes: true,
    showComms: true,
    layout: "split",
  },
};

/**
 * Collaborative session with room indicator.
 */
export const CollaborativeSession: Story = {
  args: {
    lectureId: "lecture-collab",
    roomId: "room-cardiac-001",
    lectureTitle: "Group Study: ECG Interpretation",
    showDrawboard: true,
    showNotes: true,
    showComms: true,
    layout: "split",
  },
};

/**
 * Notes-only mode for focused note-taking.
 */
export const NotesOnly: Story = {
  args: {
    lectureId: "lecture-notes",
    lectureTitle: "Quick Notes Session",
    showDrawboard: false,
    showNotes: true,
    showComms: false,
    layout: "split",
  },
};

/**
 * Drawboard-only mode for diagram-focused sessions.
 */
export const DrawboardOnly: Story = {
  args: {
    lectureId: "lecture-draw",
    lectureTitle: "Anatomy Diagrams",
    showDrawboard: true,
    showNotes: false,
    showComms: false,
    layout: "split",
  },
};

/**
 * Full workspace with all panels and comms.
 */
export const FullWorkspace: Story = {
  args: {
    lectureId: "lecture-full",
    lectureTitle: "Study Group Session",
    currentTimestamp: 3600,
    showDrawboard: true,
    showNotes: true,
    showComms: true,
    layout: "split",
    commsContent: (
      <div className="flex h-full flex-col rounded-lg border border-border/40 bg-card/60 p-4">
        <h3 className="mb-3 text-sm font-medium text-foreground">Study Group Chat</h3>
        <div className="flex-1 space-y-2 overflow-y-auto">
          <div className="rounded bg-card/80 p-2 text-xs">
            <span className="font-medium text-cyan-neon">Alice:</span>{" "}
            <span className="text-muted-foreground">
              Can someone explain the Frank-Starling mechanism?
            </span>
          </div>
          <div className="rounded bg-card/80 p-2 text-xs">
            <span className="font-medium text-purple-400">Bob:</span>{" "}
            <span className="text-muted-foreground">
              It&apos;s about preload and stroke volume relationship
            </span>
          </div>
          <div className="rounded bg-card/80 p-2 text-xs">
            <span className="font-medium text-green-400">Carol:</span>{" "}
            <span className="text-muted-foreground">Check the diagram I just drew 👆</span>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            placeholder="Type a message..."
            className="flex-1 rounded border border-border/40 bg-background px-3 py-1.5 text-sm"
          />
          <button className="rounded bg-cyan-neon/20 px-3 py-1.5 text-sm text-cyan-neon hover:bg-cyan-neon/30">
            Send
          </button>
        </div>
      </div>
    ),
  },
};

/**
 * Interactive story demonstrating layout switching.
 */
export const Interactive: Story = {
  render: function InteractiveStory() {
    const [layout, setLayout] = useState<WorkspaceLayoutMode>("split");
    const [focusPanel, setFocusPanel] = useState<WorkspaceFocusPanel>("notes");

    return (
      <LectureWorkspaceLayout
        lectureId="lecture-interactive"
        lectureTitle="Interactive Demo"
        showDrawboard
        showNotes
        showComms
        layout={layout}
        focusPanel={focusPanel}
        onLayoutChange={(newLayout, newFocus) => {
          setLayout(newLayout);
          if (newFocus) setFocusPanel(newFocus);
        }}
        onNotesChange={(content) => {
          console.log("Notes changed:", content.length, "blocks");
        }}
        onDrawboardChange={(xml) => {
          console.log("Drawboard changed:", xml.length, "chars");
        }}
      />
    );
  },
};
