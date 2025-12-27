"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  BookOpen,
  Calendar,
  Home,
  MessageSquare,
  Pause,
  Play,
  Search,
  Settings,
  SkipForward,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import * as React from "react";

const commandPaletteVariants = cva("fixed inset-0 z-50 flex items-start justify-center p-4", {
  variants: {
    variant: {
      default: "bg-black/50 backdrop-blur-sm",
      dark: "bg-black/80 backdrop-blur-md",
      light: "bg-white/80 backdrop-blur-sm",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface CommandPaletteItem {
  id: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  shortcut?: string[];
  group?: string;
  action: () => void;
  keywords?: string[];
}

export interface CommandPaletteProps
  extends
    Omit<
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
    VariantProps<typeof commandPaletteVariants> {
  /** Whether the palette is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Command items */
  items: CommandPaletteItem[];
  /** Placeholder text */
  placeholder?: string;
  /** Empty state text */
  emptyText?: string;
  /** Loading state */
  loading?: boolean;
  /** Disable animations */
  disableAnimations?: boolean;
  /** Custom footer */
  footer?: React.ReactNode;
  /** Recent commands */
  recentCommands?: string[];
}

export function CommandPalette({
  className,
  variant,
  open,
  onOpenChange,
  items,
  placeholder = "Search commands...",
  emptyText = "No results found.",
  loading = false,
  disableAnimations = false,
  footer,
  recentCommands = [],
  ...props
}: CommandPaletteProps) {
  const [value, setValue] = React.useState("");
  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  // Group items by category
  const groupedItems = React.useMemo(() => {
    const groups: Record<string, CommandPaletteItem[]> = {};

    items.forEach((item) => {
      const group = item.group || "Commands";
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(item);
    });

    return groups;
  }, [items]);

  // Handle keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(true);
      }

      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const handleSelect = (item: CommandPaletteItem) => {
    item.action();
    onOpenChange(false);
    setValue("");
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className={cn(commandPaletteVariants({ variant }))}
            initial={shouldAnimate ? { opacity: 0 } : {}}
            animate={{ opacity: 1 }}
            exit={shouldAnimate ? { opacity: 0 } : {}}
            transition={{ duration: shouldAnimate ? 0.2 : 0 }}
            onClick={() => onOpenChange(false)}
          />

          {/* Palette */}
          <motion.div
            className={cn(
              "relative w-full max-w-2xl mx-4 bg-card border border-border rounded-lg shadow-2xl overflow-hidden",
              className
            )}
            initial={shouldAnimate ? { opacity: 0, scale: 0.95, y: -20 } : {}}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={shouldAnimate ? { opacity: 0, scale: 0.95, y: -20 } : {}}
            transition={{
              duration: shouldAnimate ? 0.2 : 0,
              type: "spring",
              bounce: 0.2,
            }}
            onClick={(e) => e.stopPropagation()}
            {...props}
          >
            <Command value={value} onValueChange={setValue} className="w-full">
              {/* Header */}
              <div className="flex items-center border-b border-border px-4 py-3">
                <Search className="h-4 w-4 text-muted-foreground mr-3" />
                <CommandInput
                  placeholder={placeholder}
                  className="flex-1 bg-transparent border-0 outline-none text-foreground placeholder:text-muted-foreground"
                  autoFocus
                />
                <div className="flex items-center gap-1 text-xs text-muted-foreground ml-3">
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">⌘</kbd>
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">K</kbd>
                </div>
              </div>

              {/* Content */}
              <CommandList className="max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Loading...</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <CommandEmpty className="py-12 text-center text-sm text-muted-foreground">
                      {emptyText}
                    </CommandEmpty>

                    {/* Recent commands */}
                    {recentCommands.length > 0 && (
                      <>
                        <CommandGroup heading="Recent">
                          {recentCommands.slice(0, 3).map((commandId) => {
                            const item = items.find((i) => i.id === commandId);
                            if (!item) return null;

                            return (
                              <CommandItem
                                key={item.id}
                                value={item.title}
                                onSelect={() => handleSelect(item)}
                                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent"
                              >
                                {item.icon || <div className="w-4 h-4" />}
                                <div className="flex-1">
                                  <div className="font-medium">{item.title}</div>
                                  {item.description && (
                                    <div className="text-sm text-muted-foreground">
                                      {item.description}
                                    </div>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">Recent</div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                        <CommandSeparator />
                      </>
                    )}

                    {/* Grouped commands */}
                    {Object.entries(groupedItems).map(([groupName, groupItems]) => (
                      <CommandGroup key={groupName} heading={groupName}>
                        {groupItems.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={item.title}
                            keywords={item.keywords}
                            onSelect={() => handleSelect(item)}
                            className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent"
                          >
                            {item.icon || <div className="w-4 h-4" />}
                            <div className="flex-1">
                              <div className="font-medium">{item.title}</div>
                              {item.description && (
                                <div className="text-sm text-muted-foreground">
                                  {item.description}
                                </div>
                              )}
                            </div>
                            {item.shortcut && (
                              <div className="flex items-center gap-0.5">
                                {item.shortcut.map((key, index) => (
                                  <React.Fragment key={index}>
                                    <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">
                                      {key}
                                    </kbd>
                                    {index < item.shortcut!.length - 1 && (
                                      <span className="text-muted-foreground">+</span>
                                    )}
                                  </React.Fragment>
                                ))}
                              </div>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </>
                )}
              </CommandList>

              {/* Footer */}
              {footer && <div className="border-t border-border px-4 py-3">{footer}</div>}
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Pre-configured command items for common use cases
export const defaultCommands: CommandPaletteItem[] = [
  {
    id: "dashboard",
    title: "Go to Dashboard",
    description: "View your study overview and progress",
    icon: <Home className="h-4 w-4" />,
    shortcut: ["⌘", "D"],
    group: "Navigation",
    keywords: ["home", "overview", "progress"],
    action: () => console.log("Navigate to dashboard"),
  },
  {
    id: "practice",
    title: "Start Practice",
    description: "Begin a new practice session",
    icon: <Target className="h-4 w-4" />,
    shortcut: ["⌘", "P"],
    group: "Actions",
    keywords: ["practice", "questions", "study"],
    action: () => console.log("Start practice session"),
  },
  {
    id: "tutor",
    title: "Open AI Tutor",
    description: "Get help from the AI study assistant",
    icon: <MessageSquare className="h-4 w-4" />,
    shortcut: ["⌘", "T"],
    group: "Actions",
    keywords: ["tutor", "ai", "help", "assistant"],
    action: () => console.log("Open AI tutor"),
  },
  {
    id: "analytics",
    title: "View Analytics",
    description: "Check your performance and statistics",
    icon: <BarChart3 className="h-4 w-4" />,
    shortcut: ["⌘", "A"],
    group: "Navigation",
    keywords: ["analytics", "stats", "performance"],
    action: () => console.log("Navigate to analytics"),
  },
  {
    id: "calendar",
    title: "Study Calendar",
    description: "View and manage your study schedule",
    icon: <Calendar className="h-4 w-4" />,
    shortcut: ["⌘", "C"],
    group: "Navigation",
    keywords: ["calendar", "schedule", "planning"],
    action: () => console.log("Navigate to calendar"),
  },
  {
    id: "achievements",
    title: "Achievements",
    description: "View your badges and accomplishments",
    icon: <Trophy className="h-4 w-4" />,
    shortcut: ["⌘", "B"],
    group: "Navigation",
    keywords: ["achievements", "badges", "awards"],
    action: () => console.log("Navigate to achievements"),
  },
  {
    id: "settings",
    title: "Settings",
    description: "Configure your study preferences",
    icon: <Settings className="h-4 w-4" />,
    shortcut: ["⌘", ",", "comma"],
    group: "Navigation",
    keywords: ["settings", "preferences", "config"],
    action: () => console.log("Navigate to settings"),
  },
  {
    id: "play",
    title: "Play Audio",
    description: "Start playing audio content",
    icon: <Play className="h-4 w-4" />,
    group: "Media",
    keywords: ["play", "audio", "start"],
    action: () => console.log("Play audio"),
  },
  {
    id: "pause",
    title: "Pause Audio",
    description: "Pause current audio playback",
    icon: <Pause className="h-4 w-4" />,
    group: "Media",
    keywords: ["pause", "audio", "stop"],
    action: () => console.log("Pause audio"),
  },
  {
    id: "next",
    title: "Next Item",
    description: "Skip to the next item",
    icon: <SkipForward className="h-4 w-4" />,
    group: "Navigation",
    keywords: ["next", "skip", "forward"],
    action: () => console.log("Next item"),
  },
  {
    id: "quick-study",
    title: "Quick Study Session",
    description: "Start a 15-minute focused study session",
    icon: <Zap className="h-4 w-4" />,
    group: "Actions",
    keywords: ["quick", "study", "session", "focus"],
    action: () => console.log("Start quick study session"),
  },
  {
    id: "meditative-mode",
    title: "Meditative Mode",
    description: "Switch to calming study environment",
    icon: <BookOpen className="h-4 w-4" />,
    shortcut: ["⌘", "M"],
    group: "Actions",
    keywords: ["meditative", "calm", "focus", "zen"],
    action: () => console.log("Enable meditative mode"),
  },
];
