import type { Meta, StoryObj } from "@storybook/react";
import { PartialBlock } from "@blocknote/core";
import { CollaborativeDocEditor } from "./CollaborativeDocEditor";

/**
 * CollaborativeDocEditor wraps BlockNote with Yjs/Liveblocks support for
 * real-time collaborative editing.
 * 
 * **Note**: Full collaboration requires wrapping in a Liveblocks `RoomProvider`.
 * These stories demonstrate the standalone (non-collaborative) mode.
 * 
 * In production, you would wrap the component:
 * ```tsx
 * <RoomProvider id="document-123">
 *   <CollaborativeDocEditor userInfo={{ name: "Alice", color: "#ff0000" }} />
 * </RoomProvider>
 * ```
 */
const meta: Meta<typeof CollaborativeDocEditor> = {
  title: "Docs/CollaborativeDocEditor",
  component: CollaborativeDocEditor,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "A BlockNote editor with optional real-time collaboration via Yjs/Liveblocks. When not in a collaboration room, functions as a standard rich text editor.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    theme: {
      control: "radio",
      options: ["light", "dark"],
    },
    readOnly: {
      control: "boolean",
    },
    disableCollaboration: {
      control: "boolean",
    },
  },
  decorators: [
    (Story) => (
      <div className="min-h-[500px] rounded-lg bg-background p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof CollaborativeDocEditor>;

// Sample content - cast to PartialBlock[] to satisfy BlockNote types
const sampleContent: PartialBlock[] = [
  {
    type: "heading" as any,
    props: { level: 1 },
    content: [{ type: "text", text: "Collaborative Document" }],
  },
  {
    type: "paragraph" as any,
    content: [
      {
        type: "text",
        text: "This document supports real-time collaboration when connected to a Liveblocks room. Multiple users can edit simultaneously with live cursors and presence.",
      },
    ],
  },
  {
    type: "heading" as any,
    props: { level: 2 },
    content: [{ type: "text", text: "Features" }],
  },
  {
    type: "bulletListItem" as any,
    content: [{ type: "text", text: "Real-time cursor positions" }],
  },
  {
    type: "bulletListItem" as any,
    content: [{ type: "text", text: "Live text synchronization via Yjs CRDT" }],
  },
  {
    type: "bulletListItem" as any,
    content: [{ type: "text", text: "Presence awareness (who's online)" }],
  },
  {
    type: "bulletListItem" as any,
    content: [{ type: "text", text: "Conflict-free concurrent editing" }],
  },
] as PartialBlock[];

/**
 * Default standalone mode (no collaboration).
 * Use this when real-time sync isn't needed.
 */
export const Standalone: Story = {
  args: {
    disableCollaboration: true,
    theme: "dark",
    placeholder: "Start typing...",
  },
};

/**
 * With pre-populated content.
 */
export const WithContent: Story = {
  args: {
    disableCollaboration: true,
    theme: "dark",
    initialContent: sampleContent,
  },
};

/**
 * Read-only mode for viewing documents.
 */
export const ReadOnly: Story = {
  args: {
    disableCollaboration: true,
    readOnly: true,
    theme: "dark",
    initialContent: sampleContent,
  },
};

/**
 * Light theme variant.
 */
export const LightTheme: Story = {
  args: {
    disableCollaboration: true,
    theme: "light",
    initialContent: sampleContent,
  },
  decorators: [
    (Story) => (
      <div className="min-h-[500px] rounded-lg bg-white p-4">
        <Story />
      </div>
    ),
  ],
};

/**
 * Collaboration placeholder - shows the "Live" indicator.
 * In production, this would be wrapped in a RoomProvider.
 * 
 * **Note**: This story shows the standalone fallback since we don't have
 * a Liveblocks room configured in Storybook.
 */
export const CollaborationMode: Story = {
  args: {
    disableCollaboration: true, // Would be false in real usage
    theme: "dark",
    userInfo: {
      name: "Demo User",
      color: "#00f0ff",
    },
    initialContent: [
      {
        type: "heading" as any,
        props: { level: 1 },
        content: [{ type: "text", text: "Collaborative Session" }],
      },
      {
        type: "paragraph" as any,
        content: [
          {
            type: "text",
            text: "When connected to a Liveblocks room, this editor would show:",
          },
        ],
      },
      {
        type: "bulletListItem" as any,
        content: [{ type: "text", text: "🟢 Live indicator in the corner" }],
      },
      {
        type: "bulletListItem" as any,
        content: [{ type: "text", text: "👥 Other users' cursors with their names" }],
      },
      {
        type: "bulletListItem" as any,
        content: [{ type: "text", text: "⚡ Instant sync across all connected clients" }],
      },
    ] as PartialBlock[],
  },
  parameters: {
    docs: {
      description: {
        story:
          "To enable true collaboration, wrap this component in a Liveblocks RoomProvider with a valid room ID. The editor will automatically sync via Yjs CRDT.",
      },
    },
  },
};

