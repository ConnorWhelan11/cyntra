"use client";

import { cn, prefersReducedMotion } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import {
  Award,
  Calendar,
  ChevronRight,
  Clock,
  Play,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import * as React from "react";
import { GlowButton } from "../../atoms/GlowButton";
import { HUDProgressRing } from "../../atoms/HUDProgressRing";

const dashboardHeroVariants = cva(
  "relative w-full py-12 px-6 overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-background via-cyan-neon/5 to-emerald-neon/5",
        dark: "bg-gradient-to-br from-background via-background to-muted/20",
        neon: "bg-gradient-to-br from-cyan-neon/10 via-magenta-neon/5 to-emerald-neon/10",
      },
      size: {
        default: "min-h-[400px]",
        compact: "min-h-[300px]",
        expanded: "min-h-[500px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface StatItem {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
}

export interface DashboardHeroProps
  extends Omit<
      React.HTMLAttributes<HTMLElement>,
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
    VariantProps<typeof dashboardHeroVariants> {
  /** Central HUD ring value (0-1) */
  readinessPercentage?: number;
  /** HUD ring label */
  readinessLabel?: string;
  /** Main heading */
  title?: string;
  /** Subtitle/description */
  subtitle?: string;
  /** Quick stats */
  stats?: StatItem[];
  /** Primary CTA text */
  primaryActionText?: string;
  /** Primary CTA callback */
  onPrimaryAction?: () => void;
  /** Secondary CTA text */
  secondaryActionText?: string;
  /** Secondary CTA callback */
  onSecondaryAction?: () => void;
  /** Custom central content */
  centralContent?: React.ReactNode;
  /** Background pattern/elements */
  backgroundElements?: React.ReactNode;
  /** Disable animations */
  disableAnimations?: boolean;
}

export function DashboardHero({
  className,
  variant,
  size,
  readinessPercentage = 0.75,
  readinessLabel = "Study Readiness",
  title = "Welcome back to your MCAT Journey",
  subtitle = "Ready to continue your medical school preparation?",
  stats = [],
  primaryActionText = "Start Session",
  onPrimaryAction,
  secondaryActionText,
  onSecondaryAction,
  centralContent,
  backgroundElements,
  disableAnimations = false,
  ...props
}: DashboardHeroProps) {
  const reducedMotion = prefersReducedMotion();
  const shouldAnimate = !disableAnimations && !reducedMotion;

  const defaultStats: StatItem[] = [
    {
      label: "Days to MCAT",
      value: "47",
      icon: <Calendar className="h-4 w-4" />,
      trend: "neutral",
    },
    {
      label: "Hours Studied",
      value: "127",
      icon: <Clock className="h-4 w-4" />,
      trend: "up",
      trendValue: "+12%",
    },
    {
      label: "Weakest Subject",
      value: "Physics",
      icon: <Target className="h-4 w-4" />,
      trend: "down",
    },
  ];

  const finalStats = stats.length > 0 ? stats : defaultStats;

  return (
    <section
      className={cn(dashboardHeroVariants({ variant, size }), className)}
      {...props}
    >
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        {backgroundElements}

        {/* Default background pattern */}
        {!backgroundElements && shouldAnimate && (
          <>
            {/* Floating orbs */}
            <motion.div
              className="absolute top-10 right-10 w-32 h-32 bg-cyan-neon/10 rounded-full blur-xl"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <motion.div
              className="absolute bottom-20 left-20 w-24 h-24 bg-emerald-neon/10 rounded-full blur-xl"
              animate={{
                scale: [1.2, 1, 1.2],
                opacity: [0.4, 0.2, 0.4],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 2,
              }}
            />
            <motion.div
              className="absolute top-1/2 left-1/3 w-16 h-16 bg-magenta-neon/10 rounded-full blur-xl"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.2, 0.5, 0.2],
              }}
              transition={{
                duration: 10,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 4,
              }}
            />
          </>
        )}

        {/* Grid overlay - Reduced opacity and larger cells */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left Column - Central HUD, Title, CTA */}
          <div className="flex flex-col items-center lg:items-start space-y-8">
            {/* Central HUD Ring */}
            <motion.div
              className="flex flex-col items-center space-y-4"
              initial={shouldAnimate ? { opacity: 0, scale: 0.8 } : {}}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: shouldAnimate ? 0.6 : 0,
                type: "spring",
                bounce: 0.4,
              }}
            >
              {centralContent || (
                <div className="relative">
                  <HUDProgressRing
                    value={readinessPercentage}
                    size={160}
                    theme="rainbow"
                    showValue
                    className="drop-shadow-2xl"
                  />
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    initial={shouldAnimate ? { opacity: 0, y: 10 } : {}}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: shouldAnimate ? 0.4 : 0,
                      delay: 0.3,
                    }}
                  >
                    <div className="text-center">
                      <div className="text-3xl font-bold text-foreground tabular-nums">
                        {Math.round(readinessPercentage * 100)}%
                      </div>
                      <div className="text-sm text-muted-foreground font-medium">
                        {readinessLabel}
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}

              <motion.div
                className="text-center lg:text-left space-y-3"
                initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: shouldAnimate ? 0.5 : 0,
                  delay: 0.2,
                }}
              >
                <h1 className="text-3xl lg:text-4xl font-bold text-foreground leading-tight">
                  {title}
                </h1>
                <p className="text-muted-foreground max-w-md text-base leading-relaxed">
                  {subtitle}
                </p>
              </motion.div>
            </motion.div>

            {/* Primary CTA - Now in left column */}
            <motion.div
              className="w-full max-w-sm"
              initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: shouldAnimate ? 0.5 : 0,
                delay: 0.6,
              }}
            >
              <GlowButton
                variant="default"
                size="lg"
                glow="low"
                onClick={onPrimaryAction}
                className="w-full px-8 py-4 text-lg font-semibold"
              >
                <Play className="h-5 w-5 mr-2" />
                {primaryActionText}
                <ChevronRight className="h-5 w-5 ml-2" />
              </GlowButton>
            </motion.div>

            {/* Secondary CTA */}
            {secondaryActionText && (
              <motion.div
                initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: shouldAnimate ? 0.5 : 0,
                  delay: 0.7,
                }}
              >
                <GlowButton
                  variant="outline"
                  size="default"
                  glow="low"
                  onClick={onSecondaryAction}
                  className="px-6 py-3"
                >
                  {secondaryActionText}
                </GlowButton>
              </motion.div>
            )}
          </div>

          {/* Right Column - Subdued Feature Chips */}
          <motion.div
            className="flex flex-col items-center lg:items-start space-y-6"
            initial={shouldAnimate ? { opacity: 0, x: 30 } : {}}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: shouldAnimate ? 0.6 : 0,
              delay: 0.3,
            }}
          >
            {/* Quick Stats Grid */}
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full"
              initial={shouldAnimate ? { opacity: 0, y: 30 } : {}}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: shouldAnimate ? 0.5 : 0,
                delay: 0.4,
              }}
            >
              {finalStats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  className="bg-card/30 backdrop-blur-sm border border-border/30 rounded-xl p-4 text-center min-h-[100px] flex flex-col justify-center"
                  initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: shouldAnimate ? 0.4 : 0,
                    delay: shouldAnimate ? 0.5 + index * 0.1 : 0,
                  }}
                >
                  <div className="flex items-center justify-center mb-2">
                    {stat.icon && (
                      <div className="text-muted-foreground mr-2">
                        {stat.icon}
                      </div>
                    )}
                    <div className="text-2xl font-bold text-foreground tabular-nums">
                      {stat.value}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground mb-1 font-medium">
                    {stat.label}
                  </div>
                  {stat.trend && stat.trendValue && (
                    <div
                      className={cn(
                        "flex items-center justify-center gap-1 text-xs",
                        stat.trend === "up" && "text-emerald-400",
                        stat.trend === "down" && "text-destructive",
                        stat.trend === "neutral" && "text-muted-foreground"
                      )}
                    >
                      {stat.trend === "up" && (
                        <TrendingUp className="h-3 w-3" />
                      )}
                      {stat.trend === "down" && (
                        <TrendingUp className="h-3 w-3 rotate-180" />
                      )}
                      <span>{stat.trendValue}</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </motion.div>

            {/* Feature highlights - Subdued */}
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-sm"
              initial={shouldAnimate ? { opacity: 0, y: 30 } : {}}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: shouldAnimate ? 0.5 : 0,
                delay: 0.8,
              }}
            >
              {[
                {
                  icon: <Zap className="h-5 w-5" />,
                  title: "AI-Powered",
                  description: "Personalized learning paths",
                },
                {
                  icon: <Award className="h-5 w-5" />,
                  title: "Gamified",
                  description: "Earn XP and achievements",
                },
              ].map((feature, index) => (
                <motion.div
                  key={feature.title}
                  className="bg-card/20 backdrop-blur-sm border border-border/20 rounded-xl p-4 text-center"
                  initial={shouldAnimate ? { opacity: 0, scale: 0.9 } : {}}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: shouldAnimate ? 0.4 : 0,
                    delay: shouldAnimate ? 0.9 + index * 0.1 : 0,
                  }}
                >
                  <div className="text-muted-foreground mb-2 flex justify-center">
                    {feature.icon}
                  </div>
                  <div className="text-sm font-medium text-foreground mb-1">
                    {feature.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {feature.description}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
