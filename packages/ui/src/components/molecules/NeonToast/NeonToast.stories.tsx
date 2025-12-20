import type { Meta, StoryObj } from "@storybook/react-vite";
import { GlowButton } from "../../atoms/GlowButton";
import { NeonToaster, neonToasts, showNeonToast } from "./NeonToast";

// Note: We export NeonToaster as the main component for Storybook
// since the actual toasts are triggered programmatically

const meta: Meta<typeof NeonToaster> = {
  title: "Molecules/NeonToast",
  component: NeonToaster,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Cyberpunk-styled toast notifications using Sonner with neon glow effects. Includes preset functions for common scenarios like correct answers, streaks, achievements, and XP gains.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    position: {
      control: { type: "select" },
      options: [
        "top-left",
        "top-center",
        "top-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
      ],
      description: "Toast position on screen",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {} as any,
  render: () => (
    <div className="p-8 min-h-screen bg-background">
      <NeonToaster position="top-right" />

      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-foreground">
            Neon Toast Demo
          </h2>
          <p className="text-muted-foreground">
            Click the buttons below to see different toast types in action
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <GlowButton
            variant="outline"
            glow="low"
            onClick={() =>
              neonToasts.correct(
                "Correct Answer!",
                "Great job! You got it right."
              )
            }
          >
            Show Correct
          </GlowButton>

          <GlowButton
            variant="outline"
            glow="low"
            onClick={() =>
              neonToasts.incorrect(
                "Incorrect Answer",
                "Don't worry, try again!"
              )
            }
          >
            Show Incorrect
          </GlowButton>

          <GlowButton
            variant="outline"
            glow="low"
            onClick={() => neonToasts.streak(15, "You're on fire!")}
          >
            Show Streak
          </GlowButton>

          <GlowButton
            variant="outline"
            glow="low"
            onClick={() =>
              neonToasts.achievement(
                "Speed Demon",
                "Answered 10 questions in under 5 minutes!"
              )
            }
          >
            Show Achievement
          </GlowButton>

          <GlowButton
            variant="outline"
            glow="low"
            onClick={() =>
              neonToasts.goalMet(
                "Daily Goal",
                "You've completed your daily study target!"
              )
            }
          >
            Show Goal Met
          </GlowButton>

          <GlowButton
            variant="outline"
            glow="low"
            onClick={() =>
              neonToasts.xpGain(250, "Bonus XP for perfect score!")
            }
          >
            Show XP Gain
          </GlowButton>

          <GlowButton
            variant="outline"
            glow="low"
            onClick={() =>
              neonToasts.warning(
                "Time Running Out",
                "Only 2 minutes left in this session"
              )
            }
          >
            Show Warning
          </GlowButton>

          <GlowButton
            variant="outline"
            glow="low"
            onClick={() =>
              neonToasts.info(
                "Study Tip",
                "Take breaks every 25 minutes for better retention"
              )
            }
          >
            Show Info
          </GlowButton>
        </div>

        <div className="pt-6 border-t border-border/20">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Custom Toasts
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GlowButton
              variant="default"
              glow="low"
              onClick={() =>
                showNeonToast({
                  type: "achievement",
                  message: "Level Up!",
                  description: "You've reached level 15",
                  duration: 6000,
                  action: {
                    label: "View Rewards",
                    onClick: () => alert("Viewing rewards!"),
                  },
                })
              }
            >
              Custom Achievement
            </GlowButton>

            <GlowButton
              variant="default"
              glow="low"
              onClick={() =>
                showNeonToast({
                  type: "correct",
                  message: "Perfect Score!",
                  description: "100% accuracy on this practice set",
                  duration: 0, // Permanent until dismissed
                  action: {
                    label: "Continue",
                    onClick: () => alert("Continuing!"),
                  },
                })
              }
            >
              Permanent Toast
            </GlowButton>
          </div>
        </div>
      </div>
    </div>
  ),
};

export const AllPositions: Story = {
  args: {} as any,
  render: () => (
    <div className="p-8 min-h-screen bg-background space-y-4">
      <NeonToaster position="top-center" />

      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Toast Positions</h2>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
          <GlowButton
            variant="outline"
            size="sm"
            onClick={() =>
              neonToasts.info("Top Left", "Toast positioned at top-left")
            }
          >
            Top Left
          </GlowButton>

          <GlowButton
            variant="outline"
            size="sm"
            onClick={() =>
              neonToasts.info("Top Center", "Toast positioned at top-center")
            }
          >
            Top Center
          </GlowButton>

          <GlowButton
            variant="outline"
            size="sm"
            onClick={() =>
              neonToasts.info("Top Right", "Toast positioned at top-right")
            }
          >
            Top Right
          </GlowButton>

          <GlowButton
            variant="outline"
            size="sm"
            onClick={() =>
              neonToasts.info("Bottom Left", "Toast positioned at bottom-left")
            }
          >
            Bottom Left
          </GlowButton>

          <GlowButton
            variant="outline"
            size="sm"
            onClick={() =>
              neonToasts.info(
                "Bottom Center",
                "Toast positioned at bottom-center"
              )
            }
          >
            Bottom Center
          </GlowButton>

          <GlowButton
            variant="outline"
            size="sm"
            onClick={() =>
              neonToasts.info(
                "Bottom Right",
                "Toast positioned at bottom-right"
              )
            }
          >
            Bottom Right
          </GlowButton>
        </div>
      </div>
    </div>
  ),
};

export const GameplayToasts: Story = {
  args: {} as any,
  render: () => (
    <div className="p-8 min-h-screen bg-background">
      <NeonToaster position="top-right" />

      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-foreground">
            Gameplay Toast Examples
          </h2>
          <p className="text-muted-foreground">
            Realistic toast scenarios for a gamified learning platform
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-semibold text-foreground">Question Feedback</h3>
            <div className="space-y-2">
              <GlowButton
                variant="outline"
                size="sm"
                onClick={() =>
                  neonToasts.correct(
                    "Excellent!",
                    "You got that organic chemistry question right!"
                  )
                }
                className="w-full"
              >
                Correct Answer
              </GlowButton>

              <GlowButton
                variant="outline"
                size="sm"
                onClick={() =>
                  neonToasts.incorrect(
                    "Not quite right",
                    "Remember to consider stereochemistry"
                  )
                }
                className="w-full"
              >
                Incorrect Answer
              </GlowButton>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-foreground">Progress Rewards</h3>
            <div className="space-y-2">
              <GlowButton
                variant="outline"
                size="sm"
                onClick={() =>
                  neonToasts.xpGain(500, "Bonus for perfect accuracy!")
                }
                className="w-full"
              >
                XP Reward
              </GlowButton>

              <GlowButton
                variant="outline"
                size="sm"
                onClick={() =>
                  neonToasts.streak(7, "Study streak is building!")
                }
                className="w-full"
              >
                Streak Milestone
              </GlowButton>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-foreground">Achievements</h3>
            <div className="space-y-2">
              <GlowButton
                variant="outline"
                size="sm"
                onClick={() =>
                  neonToasts.achievement(
                    "First Perfect Score",
                    "You aced that practice test!"
                  )
                }
                className="w-full"
              >
                New Achievement
              </GlowButton>

              <GlowButton
                variant="outline"
                size="sm"
                onClick={() =>
                  neonToasts.goalMet(
                    "Weekly Target",
                    "200 questions completed this week!"
                  )
                }
                className="w-full"
              >
                Goal Achieved
              </GlowButton>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-foreground">System Messages</h3>
            <div className="space-y-2">
              <GlowButton
                variant="outline"
                size="sm"
                onClick={() =>
                  neonToasts.warning(
                    "Session Ending",
                    "Save your progress before time runs out"
                  )
                }
                className="w-full"
              >
                Warning
              </GlowButton>

              <GlowButton
                variant="outline"
                size="sm"
                onClick={() =>
                  neonToasts.info(
                    "Study Tip",
                    "Review this topic again tomorrow for better retention"
                  )
                }
                className="w-full"
              >
                Study Tip
              </GlowButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
};

export const ReducedMotion: Story = {
  args: {} as any,
  render: () => (
    <div className="p-8 min-h-screen bg-background">
      <NeonToaster position="top-right" />

      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold text-foreground">
          Reduced Motion Toasts
        </h2>
        <GlowButton
          variant="outline"
          glow="low"
          onClick={() =>
            showNeonToast({
              type: "achievement",
              message: "No Animations",
              description: "This toast respects prefers-reduced-motion",
              disableAnimations: true,
            })
          }
        >
          Show Reduced Motion Toast
        </GlowButton>
      </div>
    </div>
  ),
};
