"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Clock,
  Mic,
  MicOff,
  Paperclip,
  Send,
  User,
  X,
} from "lucide-react";
import * as React from "react";
import { GlowButton } from "../../atoms/GlowButton";
import { IconPulse } from "../../atoms/IconPulse";

const tutorDrawerVariants = cva(
  "fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col bg-background border-l border-border/40 shadow-2xl backdrop-blur-md",
  {
    variants: {
      size: {
        default: "max-w-md",
        wide: "max-w-lg",
        full: "max-w-full",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

export interface ChatMessage {
  id: string;
  type: "user" | "agent";
  content: string;
  timestamp: Date;
  agentName?: string;
  typing?: boolean;
  attachments?: Array<{
    name: string;
    type: "image" | "document" | "link";
    url: string;
  }>;
}

export interface TutorDrawerProps
  extends Omit<
      React.HTMLAttributes<HTMLDivElement>,
      | "children"
      | "onDrag"
      | "onDragEnd"
      | "onDragEnter"
      | "onDragExit"
      | "onDragLeave"
      | "onDragOver"
      | "onDragStart"
      | "onDrop"
      | "onAnimationStart"
      | "onAnimationEnd"
      | "onAnimationIteration"
    >,
    VariantProps<typeof tutorDrawerVariants> {
  /** Whether the drawer is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Chat messages */
  messages: ChatMessage[];
  /** Current input value */
  inputValue: string;
  /** Callback when input changes */
  onInputChange: (value: string) => void;
  /** Callback when message is sent */
  onSendMessage: (content: string) => void;
  /** Agent online status */
  agentOnline?: boolean;
  /** Agent name */
  agentName?: string;
  /** Whether agent is typing */
  agentTyping?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Disable animations */
  disableAnimations?: boolean;
  /** Voice input enabled */
  voiceEnabled?: boolean;
  /** File upload enabled */
  fileUploadEnabled?: boolean;
}

export function TutorDrawer({
  className,
  size,
  open,
  onOpenChange,
  messages,
  inputValue,
  onInputChange,
  onSendMessage,
  agentOnline = true,
  agentName = "AI Tutor",
  agentTyping = false,
  loading = false,
  placeholder = "Ask me anything about your studies...",
  disableAnimations = false,
  voiceEnabled = false,
  fileUploadEnabled = false,
  ...props
}: TutorDrawerProps) {
  const [isRecording, setIsRecording] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  // Auto-scroll to bottom when new messages arrive
  React.useEffect(() => {
    if (messagesEndRef.current && open) {
      messagesEndRef.current.scrollIntoView({
        behavior: shouldAnimate ? "smooth" : "auto",
      });
    }
  }, [messages, open, shouldAnimate]);

  // Focus input when drawer opens
  React.useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSendMessage = () => {
    if (inputValue.trim() && !loading) {
      const message = inputValue.trim();

      // Check for slash commands
      if (message.startsWith("/")) {
        handleSlashCommand(message);
      } else {
        onSendMessage(message);
      }

      onInputChange("");
    }
  };

  const handleSlashCommand = (command: string) => {
    const [cmd, ...args] = command.slice(1).split(" ");
    const argString = args.join(" ");

    switch (cmd.toLowerCase()) {
      case "help":
        // Show help message
        onSendMessage("/help");
        break;
      case "clear":
        // Clear conversation
        onSendMessage("/clear");
        break;
      case "study":
        // Start study mode
        onSendMessage(`/study ${argString}`);
        break;
      case "practice":
        // Start practice mode
        onSendMessage(`/practice ${argString}`);
        break;
      case "explain":
        // Request explanation
        onSendMessage(`/explain ${argString}`);
        break;
      case "flashcard":
        // Create flashcard
        onSendMessage(`/flashcard ${argString}`);
        break;
      case "quiz":
        // Start quiz
        onSendMessage(`/quiz ${argString}`);
        break;
      case "stats":
        // Show statistics
        onSendMessage("/stats");
        break;
      case "settings":
        // Open settings
        onSendMessage("/settings");
        break;
      default:
        // Unknown command
        onSendMessage(command);
        break;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Handle file upload logic here
      console.log("Files uploaded:", files);
    }
  };

  const toggleVoiceRecording = () => {
    setIsRecording(!isRecording);
    // Handle voice recording logic here
    console.log("Voice recording:", !isRecording);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldAnimate ? 0.2 : 0 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />

          {/* Drawer */}
          <motion.div
            initial={shouldAnimate ? { x: "100%" } : {}}
            animate={{ x: 0 }}
            exit={shouldAnimate ? { x: "100%" } : {}}
            transition={{
              duration: shouldAnimate ? 0.3 : 0,
              type: "spring",
              bounce: 0.1,
            }}
            className={cn(tutorDrawerVariants({ size }), className)}
            {...props}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/40 p-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <IconPulse
                    icon={<Bot className="h-6 w-6" />}
                    variant="accent"
                    intensity="medium"
                    pulse={agentOnline}
                    size="lg"
                    className="rounded-full bg-cyan-neon/10 p-2"
                  />
                  {agentOnline && (
                    <motion.div
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-neon shadow-neon-emerald"
                      animate={{
                        scale: [1, 1.2, 1],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  )}
                </div>

                <div className="space-y-0.5">
                  <motion.h3
                    className="font-semibold text-foreground"
                    initial={shouldAnimate ? { opacity: 0, x: -10 } : {}}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: shouldAnimate ? 0.3 : 0,
                      delay: 0.1,
                    }}
                  >
                    {agentName}
                  </motion.h3>
                  <motion.div
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                    initial={shouldAnimate ? { opacity: 0, x: -10 } : {}}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: shouldAnimate ? 0.3 : 0,
                      delay: 0.2,
                    }}
                  >
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        agentOnline ? "bg-emerald-neon" : "bg-muted-foreground"
                      )}
                    />
                    <span>{agentOnline ? "Online" : "Offline"}</span>
                  </motion.div>
                </div>
              </div>

              <GlowButton
                variant="ghost"
                size="sm"
                glow="none"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </GlowButton>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto p-4 space-y-4">
                <AnimatePresence initial={false}>
                  {messages.map((message, index) => (
                    <motion.div
                      key={message.id}
                      initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
                      animate={{ opacity: 1, y: 0 }}
                      exit={shouldAnimate ? { opacity: 0, y: -20 } : {}}
                      transition={{
                        duration: shouldAnimate ? 0.3 : 0,
                        delay: shouldAnimate ? index * 0.05 : 0,
                      }}
                      className={cn(
                        "flex gap-3",
                        message.type === "user"
                          ? "justify-end"
                          : "justify-start"
                      )}
                    >
                      {message.type === "agent" && (
                        <IconPulse
                          icon={<Bot className="h-4 w-4" />}
                          variant="accent"
                          intensity="low"
                          size="sm"
                          className="rounded-full bg-cyan-neon/10 p-1.5 flex-shrink-0 mt-1"
                        />
                      )}

                      <div
                        className={cn(
                          "max-w-[80%] space-y-2",
                          message.type === "user" ? "items-end" : "items-start"
                        )}
                      >
                        {/* Message bubble */}
                        <div
                          className={cn(
                            "rounded-lg px-3 py-2 text-sm",
                            message.type === "user"
                              ? "bg-cyan-neon/10 text-foreground border border-cyan-neon/20"
                              : "bg-card/80 text-foreground border border-border/40"
                          )}
                        >
                          {message.content}
                        </div>

                        {/* Attachments */}
                        {message.attachments &&
                          message.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {message.attachments.map(
                                (attachment, attachmentIndex) => (
                                  <div
                                    key={attachmentIndex}
                                    className="flex items-center gap-2 rounded border border-border/40 bg-card/40 px-2 py-1 text-xs"
                                  >
                                    <Paperclip className="h-3 w-3" />
                                    <span>{attachment.name}</span>
                                  </div>
                                )
                              )}
                            </div>
                          )}

                        {/* Timestamp */}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{message.timestamp.toLocaleTimeString()}</span>
                        </div>
                      </div>

                      {message.type === "user" && (
                        <div className="h-6 w-6 rounded-full bg-primary flex-shrink-0 mt-1 flex items-center justify-center">
                          <User className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Typing indicator */}
                {agentTyping && (
                  <motion.div
                    initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldAnimate ? { opacity: 0, y: -20 } : {}}
                    transition={{ duration: shouldAnimate ? 0.2 : 0 }}
                    className="flex gap-3"
                  >
                    <IconPulse
                      icon={<Bot className="h-4 w-4" />}
                      variant="accent"
                      intensity="low"
                      size="sm"
                      className="rounded-full bg-cyan-neon/10 p-1.5 flex-shrink-0 mt-1"
                    />
                    <div className="bg-card/80 border border-border/40 rounded-lg px-3 py-2">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                        <div
                          className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                          style={{ animationDelay: "0.1s" }}
                        />
                        <div
                          className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                          style={{ animationDelay: "0.2s" }}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Composer */}
            <div className="border-t border-border/40 p-4">
              <div className="space-y-3">
                {/* Input */}
                <div className="relative">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => onInputChange(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={placeholder}
                    disabled={loading}
                    className={cn(
                      "w-full resize-none rounded-lg border border-border/40 bg-card/40 px-3 py-2 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:border-cyan-neon/40 focus:outline-none focus:ring-1 focus:ring-cyan-neon/20",
                      "min-h-[60px] max-h-[120px]",
                      loading && "opacity-50 cursor-not-allowed"
                    )}
                    rows={1}
                    style={{
                      height: "auto",
                      minHeight: "60px",
                    }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                    }}
                  />

                  {/* Action buttons */}
                  <div className="absolute right-2 top-2 flex gap-1">
                    {voiceEnabled && (
                      <GlowButton
                        variant="ghost"
                        size="sm"
                        glow="none"
                        onClick={toggleVoiceRecording}
                        className={cn(
                          "h-6 w-6 p-0",
                          isRecording && "text-destructive"
                        )}
                      >
                        {isRecording ? (
                          <MicOff className="h-3 w-3" />
                        ) : (
                          <Mic className="h-3 w-3" />
                        )}
                      </GlowButton>
                    )}

                    {fileUploadEnabled && (
                      <GlowButton
                        variant="ghost"
                        size="sm"
                        glow="none"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-6 w-6 p-0"
                      >
                        <Paperclip className="h-3 w-3" />
                      </GlowButton>
                    )}

                    <GlowButton
                      variant="ghost"
                      size="sm"
                      glow="low"
                      onClick={handleSendMessage}
                      disabled={!inputValue.trim() || loading}
                      className="h-6 w-6 p-0"
                    >
                      <Send className="h-3 w-3" />
                    </GlowButton>
                  </div>
                </div>

                {/* Hidden file input */}
                {fileUploadEnabled && (
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                )}

                {/* Status */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {loading
                      ? "Sending..."
                      : agentTyping
                        ? "AI is typing..."
                        : "Ready"}
                  </span>
                  <span>{inputValue.length}/2000</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
