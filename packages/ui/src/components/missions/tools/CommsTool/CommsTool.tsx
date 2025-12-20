"use client";

/**
 * CommsTool — Chat/comms tool for pod missions
 * Wraps CommsChannelShell and emits tool events
 */

import { MessageSquare, Send, Users } from "lucide-react";
import { useState, useCallback } from "react";
import type { MissionTool, MissionToolRenderProps } from "../../../../missions/types";
import { useMissionRuntime } from "../../../../missions/provider";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data (v0.1)
// ─────────────────────────────────────────────────────────────────────────────

const mockParticipants = [
  { id: "u1", name: "You", isOnline: true },
  { id: "u2", name: "Alex K.", isOnline: true },
  { id: "u3", name: "Jamie L.", isOnline: false },
];

const mockMessages = [
  { id: "m1", userId: "u2", name: "Alex K.", text: "Ready to dive into Frank-Starling?", time: "2:32 PM" },
  { id: "m2", userId: "u1", name: "You", text: "Let's do it! Should we start with the basic curve?", time: "2:33 PM" },
  { id: "m3", userId: "u2", name: "Alex K.", text: "Yes, I'll draw the axes. You handle the labeling.", time: "2:33 PM" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tool Panel Component
// ─────────────────────────────────────────────────────────────────────────────

export function CommsToolPanel({ toolId }: MissionToolRenderProps) {
  const { dispatch } = useMissionRuntime();
  const [messages, setMessages] = useState(mockMessages);
  const [draft, setDraft] = useState("");

  const handleSend = useCallback(() => {
    if (!draft.trim()) return;

    const newMessage = {
      id: `m${messages.length + 1}`,
      userId: "u1",
      name: "You",
      text: draft.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, newMessage]);
    setDraft("");

    dispatch({
      type: "tool/event",
      toolId,
      name: "comms/messageSent",
      data: { text: newMessage.text },
    } as Parameters<typeof dispatch>[0]);
  }, [draft, messages.length, dispatch, toolId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="comms-tool flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Pod Chat</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          <span>{mockParticipants.filter((p) => p.isOnline).length} online</span>
        </div>
      </div>

      {/* Participants */}
      <div className="flex gap-1 border-b border-border/40 px-4 py-2">
        {mockParticipants.map((p) => (
          <div
            key={p.id}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs",
              p.isOnline ? "bg-emerald-neon/10 text-emerald-neon" : "bg-muted/40 text-muted-foreground"
            )}
          >
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              p.isOnline ? "bg-emerald-neon" : "bg-muted-foreground"
            )} />
            {p.name}
          </div>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex flex-col gap-1",
              msg.userId === "u1" ? "items-end" : "items-start"
            )}
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">{msg.name}</span>
              <span>{msg.time}</span>
            </div>
            <div
              className={cn(
                "rounded-lg px-3 py-2 text-sm max-w-[80%]",
                msg.userId === "u1"
                  ? "bg-cyan-neon/20 text-cyan-neon"
                  : "bg-card/60 text-foreground"
              )}
            >
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-border/40 p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-cyan-neon/40 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-neon/20 text-cyan-neon hover:bg-cyan-neon/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Definition
// ─────────────────────────────────────────────────────────────────────────────

export const CommsTool: MissionTool = {
  id: "glia.comms",
  title: "Comms",
  description: "Chat with your pod members",
  icon: <MessageSquare className="h-4 w-4" />,
  Panel: CommsToolPanel,
  handlesEvents: true,
};

