Demo component blueprint (atoms → molecules → organisms)
A. Atoms (prove the visual language)

HUDProgressRing (circular conic-gradient dial + Motion number tween)

GlowButton (shadcn Button variant with neon focus/hover states)

GlowInput (form input with focus ring + subtle scanline bg)

StatBadge (XP, streaks; color-coded)

ModeToggle (Dark ↔ Meditative; writes to next-themes)

IconPulse (Lucide icon wrapper with hover pulse)

Stories to include: default, hover, focus-visible, disabled, with/without labels, RTL, high contrast.

B. Molecules (screen elements)

QuestCard (mission title, reward XP, difficulty pill, progress bar)

StudyNode (timeline node: topic, est. time, difficulty; opens Popover)

KPIStat (Tremor card variant; supports delta up/down, sparkline)

RadarChart (Nivo/ECharts wrapped + themed; slots for legend)

TutorCard (agent “projection” card: text, bullet points, mini-graph)

NeonToast (Sonner preset styles for “Correct”, “Streak”, “Goal Met”)

Stories: states (idle/hover/active), data extremes, loading, error (MSW), compact vs roomy.

C. Organisms (page sections)

TutorDrawer (Vaul)

Header (agent orb + “online” pulse)

Body (chat transcript list + Composer)

“Project to dashboard” action (sends cards to a region)

PracticeQuestionCard

Stem, choices, action bar

Feedback states: correct (neon charge), wrong (glitch + reconstruct)

Expander to ExplanationPanel (diagram slot, bullet rationale)

StudyTimeline (React Chrono wrapper)

Vertical list, animated reveal

Node → opens Task Drawer (detail, reschedule, mark done)

DashboardHero

Central HUD ring (readiness %)

Quick stats (Days to MCAT, Hours studied, Weakest subject)

“Start Session” CTA

CommandPalette (cmdk)

Actions: Jump to Practice, Open Tutor, Search Topic, Start Meditative Mode

Fuzzy results with iconography

AgentOrb3D (r3f)

Slow rotation, postprocessing bloom

Props for intensity, color, “speaking” pulse

Stories: each organism with knobs/controls for mock props; a11y checks; keyboard paths.

5. Playground pages (optional inside Next)

Create /lab/ routes that mount organisms in page context:

/lab/dashboard

/lab/study-plan

/lab/practice

/lab/tutor
These read fixtures from `packages/ag-ui-ext/src/fixtures/*` so you can iterate styling with real-ish layouts.

6. Testing the look & behavior

Visual: Chromatic (or Ladle + Playwright screenshot tests).

A11y: @storybook/addon-a11y + axe checks in CI.

Interactions: @storybook/test for play functions (open drawer, submit answer).

Contracts: Zod schemas for component props + fixture validation.
