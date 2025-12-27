import React from "react";

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  text: string;
  createdAt: number;
}

export interface RealmParticipant {
  userId: string;
  lastSeenAt: number;
}

export interface CommsChannelShellProps {
  messages: Message[];
  participants: RealmParticipant[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
}

export function CommsChannelShell({
  messages,
  participants,
  draft,
  onDraftChange,
  onSend,
}: CommsChannelShellProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between border-b pb-2">
        <h3 className="text-lg font-semibold">Comms Channel</h3>
        <div className="text-sm text-muted-foreground">
          {participants.length} participant{participants.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Messages */}
      <div className="mb-4 flex-1 space-y-2 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No messages yet
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="rounded-md bg-muted p-3 shadow-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium">{msg.userId}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-sm">{msg.text}</p>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={onSend}
          disabled={!draft.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
