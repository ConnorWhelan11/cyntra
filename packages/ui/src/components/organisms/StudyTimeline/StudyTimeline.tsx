"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { AnimatePresence, motion, useInView } from "framer-motion";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  Target,
  Trophy,
} from "lucide-react";
import * as React from "react";
import { GlowButton } from "../../atoms/GlowButton";
import { StatBadge } from "../../atoms/StatBadge";

const studyTimelineVariants = cva("relative w-full", {
  variants: {
    variant: {
      default: "",
      compact: "space-y-4",
      expanded: "space-y-8",
    },
    orientation: {
      vertical: "",
      horizontal: "flex overflow-x-auto pb-4",
    },
  },
  defaultVariants: {
    variant: "default",
    orientation: "vertical",
  },
});

export interface TimelineItem {
  id: string;
  date: Date;
  title: string;
  description?: string;
  type: "study" | "achievement" | "milestone" | "exam" | "break";
  status: "completed" | "in-progress" | "upcoming";
  duration?: number; // in minutes
  xpEarned?: number;
  subjects?: string[];
  difficulty?: "Easy" | "Medium" | "Hard" | "Expert";
  achievements?: string[];
  metadata?: Record<string, any>;
}

export interface StudyTimelineProps
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
    VariantProps<typeof studyTimelineVariants> {
  /** Timeline items */
  items: TimelineItem[];
  /** Show timeline line */
  showLine?: boolean;
  /** Group items by date */
  groupByDate?: boolean;
  /** Expandable items */
  expandableItems?: boolean;
  /** Show item details */
  showDetails?: boolean;
  /** Max items to show */
  maxItems?: number;
  /** Show "Load More" button */
  showLoadMore?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Disable animations */
  disableAnimations?: boolean;
  /** On item click callback */
  onItemClick?: (item: TimelineItem) => void;
  /** On load more callback */
  onLoadMore?: () => void;
}

export function StudyTimeline({
  className,
  variant,
  orientation = "vertical",
  items,
  showLine = true,
  groupByDate = false,
  expandableItems = false,
  showDetails = true,
  maxItems,
  showLoadMore = false,
  loading = false,
  disableAnimations = false,
  onItemClick,
  onLoadMore,
  ...props
}: StudyTimelineProps) {
  const [expandedItems, setExpandedItems] = React.useState<Set<string>>(
    new Set()
  );
  const [visibleItems, setVisibleItems] = React.useState(
    maxItems || items.length
  );

  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  const displayedItems = items.slice(0, visibleItems);
  const groupedItems = groupByDate
    ? groupItemsByDate(displayedItems)
    : { "": displayedItems };

  const toggleItemExpansion = (itemId: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const getItemIcon = (
    type: TimelineItem["type"],
    status: TimelineItem["status"]
  ) => {
    if (status === "completed") {
      return <CheckCircle2 className="h-5 w-5" />;
    }

    switch (type) {
      case "achievement":
        return <Trophy className="h-5 w-5" />;
      case "milestone":
        return <Target className="h-5 w-5" />;
      case "exam":
        return <BookOpen className="h-5 w-5" />;
      case "break":
        return <Clock className="h-5 w-5" />;
      default:
        return <Circle className="h-5 w-5" />;
    }
  };

  const getItemColor = (
    type: TimelineItem["type"],
    status: TimelineItem["status"]
  ) => {
    if (status === "completed") {
      return "text-emerald-neon bg-emerald-neon/10 border-emerald-neon/30";
    }
    if (status === "in-progress") {
      return "text-cyan-neon bg-cyan-neon/10 border-cyan-neon/30";
    }

    switch (type) {
      case "achievement":
        return "text-yellow-500 bg-yellow-500/10 border-yellow-500/30";
      case "milestone":
        return "text-magenta-neon bg-magenta-neon/10 border-magenta-neon/30";
      case "exam":
        return "text-destructive bg-destructive/10 border-destructive/30";
      case "break":
        return "text-muted-foreground bg-muted/10 border-muted-foreground/30";
      default:
        return "text-cyan-neon bg-cyan-neon/10 border-cyan-neon/30";
    }
  };

  return (
    <div
      className={cn(studyTimelineVariants({ variant, orientation }), className)}
      {...props}
    >
      {orientation === "vertical" ? (
        <div className="relative">
          {/* Timeline line */}
          {showLine && (
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
          )}

          {Object.entries(groupedItems).map(([dateKey, dateItems]) => (
            <div key={dateKey} className="relative">
              {/* Date header */}
              {groupByDate && dateKey && (
                <motion.div
                  className="flex items-center gap-3 mb-4"
                  initial={shouldAnimate ? { opacity: 0, x: -20 } : {}}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: shouldAnimate ? 0.3 : 0 }}
                >
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    {dateKey}
                  </span>
                </motion.div>
              )}

              {/* Timeline items */}
              <div className="space-y-6">
                {dateItems.map((item, index) => (
                  <TimelineItemComponent
                    key={item.id}
                    item={item}
                    index={index}
                    isExpanded={expandedItems.has(item.id)}
                    onToggle={() => toggleItemExpansion(item.id)}
                    onClick={() => onItemClick?.(item)}
                    showLine={showLine}
                    expandable={expandableItems}
                    showDetails={showDetails}
                    orientation={orientation}
                    shouldAnimate={shouldAnimate}
                    getItemIcon={getItemIcon}
                    getItemColor={getItemColor}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Horizontal timeline */
        <div className="flex gap-6 overflow-x-auto pb-4">
          {displayedItems.map((item, index) => (
            <TimelineItemComponent
              key={item.id}
              item={item}
              index={index}
              isExpanded={expandedItems.has(item.id)}
              onToggle={() => toggleItemExpansion(item.id)}
              onClick={() => onItemClick?.(item)}
              showLine={false}
              expandable={expandableItems}
              showDetails={showDetails}
              orientation={orientation || "vertical"}
              shouldAnimate={shouldAnimate}
              getItemIcon={getItemIcon}
              getItemColor={getItemColor}
            />
          ))}
        </div>
      )}

      {/* Load More */}
      {showLoadMore && visibleItems < items.length && (
        <motion.div
          className="flex justify-center pt-6"
          initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: shouldAnimate ? 0.3 : 0 }}
        >
          <GlowButton
            variant="outline"
            onClick={() => {
              setVisibleItems((prev) =>
                Math.min(prev + (maxItems || 10), items.length)
              );
              onLoadMore?.();
            }}
            disabled={loading}
          >
            {loading
              ? "Loading..."
              : `Load More (${items.length - visibleItems} remaining)`}
          </GlowButton>
        </motion.div>
      )}
    </div>
  );
}

function TimelineItemComponent({
  item,
  index,
  isExpanded,
  onToggle,
  onClick,
  showLine,
  expandable,
  showDetails,
  orientation,
  shouldAnimate,
  getItemIcon,
  getItemColor,
}: {
  item: TimelineItem;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onClick?: () => void;
  showLine: boolean;
  expandable: boolean;
  showDetails: boolean;
  orientation: "vertical" | "horizontal";
  shouldAnimate: boolean;
  getItemIcon: (
    type: TimelineItem["type"],
    status: TimelineItem["status"]
  ) => React.ReactNode;
  getItemColor: (
    type: TimelineItem["type"],
    status: TimelineItem["status"]
  ) => string;
}) {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  return (
    <motion.div
      ref={ref}
      className={cn(
        "relative flex gap-4",
        orientation === "vertical"
          ? "items-start"
          : "flex-col items-center min-w-64"
      )}
      initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
      animate={shouldAnimate && isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: shouldAnimate ? 0.3 : 0,
        delay: shouldAnimate ? index * 0.1 : 0,
      }}
    >
      {/* Timeline node */}
      <motion.div
        className={cn(
          "flex-shrink-0 rounded-full border-2 p-2 transition-all duration-200",
          getItemColor(item.type, item.status),
          showLine &&
            orientation === "vertical" &&
            "relative z-10 bg-background"
        )}
        whileHover={shouldAnimate ? { scale: 1.1 } : {}}
        whileTap={shouldAnimate ? { scale: 0.95 } : {}}
        onClick={onClick}
        style={
          showLine && orientation === "vertical" ? { marginLeft: "-2px" } : {}
        }
      >
        {getItemIcon(item.type, item.status)}
      </motion.div>

      {/* Content */}
      <div
        className={cn(
          "flex-1 space-y-2 pb-6",
          orientation === "vertical" ? "" : "text-center"
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1">
            <h3 className="font-semibold text-foreground text-sm leading-tight">
              {item.title}
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatDate(item.date)}</span>
              {item.duration && (
                <>
                  <span>•</span>
                  <span>{formatDuration(item.duration)}</span>
                </>
              )}
            </div>
          </div>

          {/* Expand/collapse button */}
          {expandable && showDetails && (
            <GlowButton
              variant="ghost"
              size="sm"
              glow="none"
              onClick={onToggle}
              className="flex-shrink-0"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </GlowButton>
          )}
        </div>

        {/* Description */}
        {item.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {item.description}
          </p>
        )}

        {/* Metadata */}
        {(item.subjects ||
          item.difficulty ||
          item.xpEarned ||
          item.achievements) &&
          showDetails && (
            <AnimatePresence>
              {(!expandable || isExpanded) && (
                <motion.div
                  className="space-y-3 pt-2"
                  initial={shouldAnimate ? { opacity: 0, height: 0 } : {}}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={shouldAnimate ? { opacity: 0, height: 0 } : {}}
                  transition={{ duration: shouldAnimate ? 0.2 : 0 }}
                >
                  {/* Subjects */}
                  {item.subjects && item.subjects.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.subjects.map((subject) => (
                        <StatBadge
                          key={subject}
                          variant="difficulty"
                          value={subject}
                          size="sm"
                        />
                      ))}
                    </div>
                  )}

                  {/* Difficulty and XP */}
                  <div className="flex items-center gap-2">
                    {item.difficulty && (
                      <StatBadge
                        variant="difficulty"
                        value={item.difficulty}
                        size="sm"
                      />
                    )}
                    {item.xpEarned && (
                      <StatBadge
                        variant="xp"
                        value={item.xpEarned}
                        suffix=" XP"
                        size="sm"
                      />
                    )}
                  </div>

                  {/* Achievements */}
                  {item.achievements && item.achievements.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-foreground">
                        Achievements
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {item.achievements.map((achievement) => (
                          <div
                            key={achievement}
                            className="flex items-center gap-1 px-2 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs"
                          >
                            <Trophy className="h-3 w-3 text-yellow-500" />
                            <span className="text-yellow-500">
                              {achievement}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          )}
      </div>
    </motion.div>
  );
}

function groupItemsByDate(
  items: TimelineItem[]
): Record<string, TimelineItem[]> {
  const groups: Record<string, TimelineItem[]> = {};

  items.forEach((item) => {
    const dateKey = item.date.toDateString();
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(item);
  });

  return groups;
}
