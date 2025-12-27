import type { Meta, StoryObj } from "@storybook/react";
import React, { useCallback, useState } from "react";
import { cn } from "../../../lib/utils";
import { FieldLayer } from "./FieldLayer";
import { FieldProvider, useFieldSurface, useFieldState } from "./FieldProvider";
import type { FieldConfig, FieldStyle, LatticeMode, PaletteMode } from "./types";

// -----------------------------------------------------------------------------
// Story Meta
// -----------------------------------------------------------------------------

const meta: Meta = {
  title: "Three/QuantumField",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Quantum Field Canvas - A reactive 3D substrate that responds to UI interactions (hover/click/selection). The field becomes visible through probe, etch, burst, and latch signals.",
      },
    },
  },
  argTypes: {
    style: {
      control: "select",
      options: ["constellation", "pcb", "water"] as FieldStyle[],
      description: "Visual style of the field",
    },
    enablePost: {
      control: "boolean",
      description: "Enable postprocessing effects",
    },
    enableTrails: {
      control: "boolean",
      description: "Enable RTT trails for etch effect",
    },
    probeRadius: {
      control: { type: "range", min: 0.02, max: 0.2, step: 0.01 },
      description: "Radius of the hover probe effect",
    },
    burstAmplitude: {
      control: { type: "range", min: 0.1, max: 1.0, step: 0.1 },
      description: "Amplitude of burst impulses",
    },
    pointsCount: {
      control: { type: "range", min: 500, max: 10000, step: 500 },
      description: "Number of points (constellation style)",
    },
    rttResolution: {
      control: "select",
      options: [128, 256, 512, 1024],
      description: "RTT resolution for trails",
    },
    // PCB Debug Controls
    showPcbPlane: {
      control: "boolean",
      description: "[PCB] Show the PCB plane layer",
    },
    showArrows: {
      control: "boolean",
      description: "[PCB] Show the arrow flow layer",
    },
    arrowsBlending: {
      control: "select",
      options: ["normal", "additive"],
      description: "[PCB] Blending mode for arrows (normal for debugging)",
    },
    arrowsMaxPointSize: {
      control: { type: "range", min: 2, max: 20, step: 1 },
      description: "[PCB] Maximum point size for arrows",
    },
  },
};

export default meta;

// -----------------------------------------------------------------------------
// Demo Surface Component
// -----------------------------------------------------------------------------

interface DemoSurfaceProps {
  id: string;
  label: string;
  className?: string;
  enableLatch?: boolean;
  isActive?: boolean;
  onClick?: () => void;
}

function DemoSurface({
  id,
  label,
  className,
  enableLatch = false,
  isActive = false,
  onClick,
}: DemoSurfaceProps) {
  const {
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
    onClick: handleFieldClick,
  } = useFieldSurface({
    id,
    enableHover: true,
    enableBurst: true,
    enableLatch,
  });

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      handleFieldClick(e);
      onClick?.();
    },
    [handleFieldClick, onClick]
  );

  return (
    <div
      className={cn(
        "relative px-4 py-3 rounded-lg cursor-pointer select-none",
        "bg-slate-800/60 border border-slate-700/50",
        "hover:bg-slate-700/60 hover:border-cyan-500/30",
        "transition-all duration-150",
        isActive && "border-cyan-400/50 bg-cyan-950/30",
        className
      )}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={handleClick}
    >
      {/* Left rail indicator */}
      <div
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full",
          "bg-cyan-400 transition-all duration-150",
          isActive ? "h-5 opacity-100" : "h-0 opacity-0"
        )}
      />
      <span className="text-sm text-slate-200 font-medium">{label}</span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// State Display Component
// -----------------------------------------------------------------------------

function StateDisplay() {
  const state = useFieldState();

  return (
    <div className="absolute top-4 right-4 p-3 rounded-lg bg-black/80 border border-slate-700/50 text-xs font-mono text-slate-300 max-w-xs">
      <div className="mb-2 text-cyan-400 font-semibold">Field State</div>
      <div className="space-y-1">
        <div>
          Hover: {state.hover.active ? "✓" : "✗"} | Intent: {state.hover.intent} | UV: (
          {state.hover.uv.x.toFixed(2)}, {state.hover.uv.y.toFixed(2)})
        </div>
        <div>Impulses: {state.impulses.length}</div>
        <div>Anchors: {state.anchors.size}</div>
        <div>Frame: {state.frame}</div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Demo Harness
// -----------------------------------------------------------------------------

interface DemoHarnessProps {
  config?: Partial<FieldConfig>;
}

function DemoHarness({ config }: DemoHarnessProps) {
  const [activeItem, setActiveItem] = useState<string | null>(null);

  const sidebarItems = [
    { id: "dashboard", label: "Dashboard" },
    { id: "missions", label: "Missions" },
    { id: "practice", label: "Practice" },
    { id: "progress", label: "Progress" },
    { id: "discover", label: "Discover" },
    { id: "connections", label: "Connections" },
    { id: "settings", label: "Settings" },
  ];

  const cardItems = [
    { id: "card-1", label: "Study Block: Biochemistry" },
    { id: "card-2", label: "Quiz: CARS Passage" },
    { id: "card-3", label: "Review: Weak Areas" },
  ];

  return (
    <div className="relative w-full h-screen bg-slate-950 overflow-hidden">
      {/* Field Layer (background) */}
      <FieldLayer config={config} pinToViewport zIndex={0} />

      {/* DOM Content (foreground) */}
      <div className="relative z-10 flex h-full pointer-events-none">
        {/* Fake Sidebar */}
        <div className="w-64 h-full p-4 pointer-events-auto">
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
              Navigation
            </h2>
            <div className="space-y-1">
              {sidebarItems.map((item) => (
                <DemoSurface
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  enableLatch
                  isActive={activeItem === item.id}
                  onClick={() => setActiveItem((prev) => (prev === item.id ? null : item.id))}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 p-8 pointer-events-auto">
          <h1 className="text-2xl font-bold text-slate-100 mb-6">Quantum Field Demo</h1>

          <p className="text-slate-400 mb-8 max-w-lg">
            Hover over sidebar items to see the <span className="text-cyan-400">probe</span> effect.
            Hold <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-xs">Shift</kbd> while
            hovering for <span className="text-pink-400">etch</span> mode. Click for{" "}
            <span className="text-cyan-300">burst</span> impulses. Click a nav item to{" "}
            <span className="text-emerald-400">latch</span> an anchor.
          </p>

          {/* Cards */}
          <div className="grid grid-cols-3 gap-4 max-w-2xl">
            {cardItems.map((item) => (
              <DemoSurface
                key={item.id}
                id={item.id}
                label={item.label}
                className="h-24 flex items-center justify-center text-center"
              />
            ))}
          </div>

          {/* Modal trigger */}
          <div className="mt-8">
            <DemoSurface
              id="modal-trigger"
              label="Open Modal (burst only)"
              className="inline-block"
            />
          </div>
        </div>
      </div>

      {/* State Display */}
      <StateDisplay />

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 p-3 rounded-lg bg-black/80 border border-slate-700/50 text-xs text-slate-400 max-w-sm">
        <div className="font-semibold text-slate-300 mb-1">Controls</div>
        <ul className="space-y-0.5">
          <li>
            • <span className="text-cyan-400">Hover</span> = probe (reveal)
          </li>
          <li>
            • <span className="text-pink-400">Shift + Hover</span> = etch (write trails)
          </li>
          <li>
            • <span className="text-cyan-300">Click</span> = burst (impulse ring)
          </li>
          <li>
            • <span className="text-emerald-400">Click nav</span> = latch (anchor)
          </li>
        </ul>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Story: Default
// -----------------------------------------------------------------------------

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    style: "constellation",
    enablePost: true,
    enableTrails: true,
    probeRadius: 0.08,
    burstAmplitude: 0.8,
    pointsCount: 6000,
    rttResolution: 512,
    // PCB debug defaults
    showPcbPlane: true,
    showArrows: true,
    arrowsBlending: "normal",
    arrowsMaxPointSize: 8,
  },
  render: (args) => {
    const config: Partial<FieldConfig> = {
      style: args.style as FieldStyle,
      enablePost: args.enablePost as boolean,
      enableTrails: args.enableTrails as boolean,
      probeRadius: args.probeRadius as number,
      burstAmplitude: args.burstAmplitude as number,
      pointsCount: args.pointsCount as number,
      rttResolution: args.rttResolution as number,
      // PCB debug controls
      showPcbPlane: args.showPcbPlane as boolean,
      showArrows: args.showArrows as boolean,
      arrowsBlending: args.arrowsBlending as "normal" | "additive",
      arrowsMaxPointSize: args.arrowsMaxPointSize as number,
    };

    return (
      <FieldProvider config={config}>
        <DemoHarness config={config} />
      </FieldProvider>
    );
  },
};

// -----------------------------------------------------------------------------
// Story: Performance Comparison
// -----------------------------------------------------------------------------

export const PerformanceLevels: Story = {
  render: () => {
    const [level, setLevel] = useState<"high" | "medium" | "low" | "minimal">("high");

    const configForLevel: Record<string, Partial<FieldConfig>> = {
      high: {
        performance: "high",
        enablePost: true,
        enableTrails: true,
        dpr: [1, 2],
        pointsCount: 6000,
      },
      medium: {
        performance: "medium",
        enablePost: true,
        enableTrails: true,
        dpr: [1, 1.5],
        pointsCount: 3000,
      },
      low: {
        performance: "low",
        enablePost: false,
        enableTrails: true,
        dpr: [1, 1],
        pointsCount: 1500,
      },
      minimal: {
        performance: "minimal",
        enablePost: false,
        enableTrails: false,
        dpr: [1, 1],
        pointsCount: 500,
      },
    };

    return (
      <FieldProvider config={configForLevel[level]}>
        <div className="relative w-full h-screen bg-slate-950">
          <FieldLayer config={configForLevel[level]} pinToViewport zIndex={0} />

          <div className="relative z-10 p-8 pointer-events-auto">
            <h1 className="text-xl font-bold text-slate-100 mb-4">
              Performance Level: {level.toUpperCase()}
            </h1>

            <div className="flex gap-2 mb-8">
              {(["high", "medium", "low", "minimal"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    level === l
                      ? "bg-cyan-500 text-black"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  )}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 8 }, (_, i) => (
                <DemoSurface key={`item-${i}`} id={`perf-item-${i}`} label={`Item ${i + 1}`} />
              ))}
            </div>
          </div>

          <StateDisplay />
        </div>
      </FieldProvider>
    );
  },
};

// -----------------------------------------------------------------------------
// Story: Style Comparison
// -----------------------------------------------------------------------------

export const StyleComparison: Story = {
  render: () => {
    const [style, setStyle] = useState<FieldStyle>("constellation");
    // PCB debug state
    const [showPcbPlane, setShowPcbPlane] = useState(true);
    const [showArrows, setShowArrows] = useState(true);
    const [arrowsBlending, setArrowsBlending] = useState<"normal" | "additive">("normal");
    // PCB lattice mode
    const [latticeMode, setLatticeMode] = useState<LatticeMode>("rect");
    // PCB lens state
    const [lensEnabled, setLensEnabled] = useState(true);

    const styleDescriptions: Record<FieldStyle, string> = {
      constellation: "Sacred/alien lattice with iridescent interference and constellation points",
      pcb: "Technical circuit-board traces with phase lens + hex/tri crystal lattice",
      water: "Damped wave simulation with refractive ripples (coming soon)",
    };

    const config: Partial<FieldConfig> = {
      style,
      enableTrails: true,
      pointsCount: 4000,
      // PCB debug controls
      showPcbPlane,
      showArrows,
      arrowsBlending,
      arrowsMaxPointSize: 8,
      // PCB lattice & lens
      latticeMode,
      lensEnabled,
    };

    return (
      <FieldProvider config={config}>
        <div className="relative w-full h-screen bg-slate-950">
          <FieldLayer config={config} pinToViewport zIndex={0} />

          <div className="relative z-10 p-8 pointer-events-auto">
            <h1 className="text-xl font-bold text-slate-100 mb-2">
              Style: {style.charAt(0).toUpperCase() + style.slice(1)}
            </h1>
            <p className="text-slate-400 text-sm mb-6 max-w-lg">{styleDescriptions[style]}</p>

            <div className="flex gap-2 mb-4">
              {(["constellation", "pcb", "water"] as FieldStyle[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    style === s
                      ? s === "constellation"
                        ? "bg-cyan-500 text-black"
                        : s === "pcb"
                          ? "bg-emerald-500 text-black"
                          : "bg-blue-500 text-black"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  )}
                >
                  {s === "constellation" ? "🌌 Constellation" : s === "pcb" ? "⚡ PCB" : "💧 Water"}
                </button>
              ))}
            </div>

            {/* PCB Debug Controls - only show when PCB style is selected */}
            {style === "pcb" && (
              <div className="flex flex-wrap gap-4 mb-8 p-3 rounded-lg bg-slate-800/50 border border-emerald-500/30">
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={showPcbPlane}
                    onChange={(e) => setShowPcbPlane(e.target.checked)}
                    className="rounded"
                  />
                  Plane
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={showArrows}
                    onChange={(e) => setShowArrows(e.target.checked)}
                    className="rounded"
                  />
                  Arrows
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={lensEnabled}
                    onChange={(e) => setLensEnabled(e.target.checked)}
                    className="rounded"
                  />
                  Lens
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  Lattice:
                  <select
                    value={latticeMode}
                    onChange={(e) => setLatticeMode(e.target.value as LatticeMode)}
                    className="bg-slate-700 rounded px-2 py-1 text-xs"
                  >
                    <option value="rect">▦ Rect</option>
                    <option value="hex">⬡ Hex</option>
                    <option value="tri">△ Tri</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  Blending:
                  <select
                    value={arrowsBlending}
                    onChange={(e) => setArrowsBlending(e.target.value as "normal" | "additive")}
                    className="bg-slate-700 rounded px-2 py-1 text-xs"
                  >
                    <option value="normal">Normal</option>
                    <option value="additive">Additive</option>
                  </select>
                </label>
              </div>
            )}

            <div className="grid grid-cols-4 gap-4 max-w-2xl">
              {Array.from({ length: 8 }, (_, i) => (
                <DemoSurface
                  key={`style-item-${i}`}
                  id={`style-item-${i}`}
                  label={`Item ${i + 1}`}
                  enableLatch
                />
              ))}
            </div>
          </div>

          <StateDisplay />
        </div>
      </FieldProvider>
    );
  },
};

// -----------------------------------------------------------------------------
// Story: Isolated Components
// -----------------------------------------------------------------------------

export const IsolatedSurface: Story = {
  render: () => {
    return (
      <FieldProvider>
        <div className="relative w-full h-screen bg-slate-950 flex items-center justify-center">
          <FieldLayer pinToViewport zIndex={0} />

          <div className="relative z-10 pointer-events-auto">
            <DemoSurface
              id="isolated-surface"
              label="Hover and click me!"
              className="w-64 h-32 flex items-center justify-center text-lg"
            />
          </div>

          <StateDisplay />
        </div>
      </FieldProvider>
    );
  },
};

// -----------------------------------------------------------------------------
// Story: PCB Ultra-Fine Lattice (Full Controls)
// -----------------------------------------------------------------------------

export const PcbLattice: Story = {
  render: () => {
    // Visibility controls
    const [showPcbPlane, setShowPcbPlane] = useState(true);
    const [showArrows, setShowArrows] = useState(true);
    const [arrowsBlending, setArrowsBlending] = useState<"normal" | "additive">("normal");

    // Micro-lattice controls
    const [microGrid1, setMicroGrid1] = useState(60);
    const [microGrid2, setMicroGrid2] = useState(200);
    const [microGridStrength, setMicroGridStrength] = useState(0.8);
    const [revealStrength, setRevealStrength] = useState(1.0);
    const [microWarp, setMicroWarp] = useState(0.015);

    // === NEW: Lattice Mode ===
    const [latticeMode, setLatticeMode] = useState<LatticeMode>("rect");

    // === NEW: Phase Lens Controls ===
    const [lensEnabled, setLensEnabled] = useState(true);
    const [lensRadius, setLensRadius] = useState(0.12);
    const [lensMagnification, setLensMagnification] = useState(1.0);
    const [lensChromatic, setLensChromatic] = useState(0.35);
    const [lensInertia, setLensInertia] = useState(0.18);
    const [lensVelocityBoost, setLensVelocityBoost] = useState(0.6);

    // Etch controls
    const [etchRadius, setEtchRadius] = useState(0.008);
    const [etchStrength, setEtchStrength] = useState(0.9);
    const [etchDecay, setEtchDecay] = useState(0.02);
    const [etchDistortion, setEtchDistortion] = useState(0.008);
    const [etchFreeze, setEtchFreeze] = useState(false);
    const [scribbleMode, setScribbleMode] = useState(false);

    // === NEW: Etch Velocity Taper Controls ===
    const [etchRadiusMin, setEtchRadiusMin] = useState(0.004);
    const [etchRadiusMax, setEtchRadiusMax] = useState(0.015);
    const [etchVelocityScale, setEtchVelocityScale] = useState(0.5);

    // === PALETTE / ATMOSPHERE Controls (Museum-Grade) ===
    const [paletteMode, setPaletteMode] = useState<PaletteMode>("orchid");
    const [accentIntensity, setAccentIntensity] = useState(1.1);
    const [iridescenceStrength, setIridescenceStrength] = useState(0.35);
    const [iridescenceScale, setIridescenceScale] = useState(14);
    const [exposure, setExposure] = useState(1.0);
    const [filmic, setFilmic] = useState(0.85);
    const [grainStrength, setGrainStrength] = useState(0.015);
    const [crtStrength, setCrtStrength] = useState(0.25);
    const [copperStrength, setCopperStrength] = useState(0.15);

    // RTT resolution
    const [rttResolution, setRttResolution] = useState(512);

    // Key for forcing remount (to clear etch)
    const [fieldKey, setFieldKey] = useState(0);

    const config: Partial<FieldConfig> = {
      style: "pcb",
      enableTrails: true,
      pointsCount: 4000,
      rttResolution,
      // Debug controls
      showPcbPlane,
      showArrows,
      arrowsBlending,
      arrowsMaxPointSize: 8,
      // Micro-lattice
      microGrid1,
      microGrid2,
      microGridStrength,
      revealStrength,
      microWarp,
      // Lattice mode
      latticeMode,
      // Phase Lens
      lensEnabled,
      lensRadius,
      lensMagnification,
      lensChromatic,
      lensInertia,
      lensVelocityBoost,
      // Etch
      etchDistortion,
      etchRadius,
      etchStrength,
      etchDecay,
      etchFreeze,
      scribbleMode,
      // Etch velocity taper
      etchRadiusMin,
      etchRadiusMax,
      etchVelocityScale,
      // Palette / Atmosphere
      paletteMode,
      accentIntensity,
      iridescenceStrength,
      iridescenceScale,
      exposure,
      filmic,
      grainStrength,
      crtStrength,
      copperStrength,
    };

    return (
      <FieldProvider key={fieldKey} config={config}>
        <div className="relative w-full h-screen bg-slate-950 overflow-hidden">
          <FieldLayer config={config} pinToViewport zIndex={0} />

          {/* Scribble Canvas - captures pointer for drawing */}
          {scribbleMode && <ScribbleCanvas />}

          <div className="relative z-20 p-4 pointer-events-auto max-w-sm max-h-[calc(100vh-2rem)] overflow-y-auto">
            <h1 className="text-lg font-bold text-emerald-400 mb-3">
              ⚡ Ultra-Fine Quantum Lattice
            </h1>

            {/* Instructions */}
            <div className="mb-4 p-2 rounded bg-black/60 text-xs text-slate-400">
              <p className="mb-1">
                <span className="text-cyan-400">Hover</span> = phase lens + reveal lattice
              </p>
              <p className="mb-1">
                <span className="text-orange-400">Shift+Hover</span> = etch/inscribe
              </p>
              <p className="mb-1">
                <span className="text-emerald-400">Scribble Mode</span> = pointer down draws
              </p>
              <p className="mt-2 text-purple-400 font-medium">
                🔮 Try Orchid palette for museum-grade vibes!
              </p>
              <p className="text-slate-500">Hex/tri lattice + iridescence = crystalline reality</p>
            </div>

            {/* Control Panels */}
            <div className="space-y-3 pr-1">
              {/* Visibility Panel */}
              <ControlPanel title="Visibility">
                <Toggle label="Plane" checked={showPcbPlane} onChange={setShowPcbPlane} />
                <Toggle label="Arrows" checked={showArrows} onChange={setShowArrows} />
                <SelectControl
                  label="Blend"
                  value={arrowsBlending}
                  onChange={(v) => setArrowsBlending(v as "normal" | "additive")}
                  options={[
                    { value: "normal", label: "Normal" },
                    { value: "additive", label: "Additive" },
                  ]}
                />
              </ControlPanel>

              {/* Lattice Panel */}
              <ControlPanel title="Micro-Lattice">
                <SelectControl
                  label="Mode"
                  value={latticeMode}
                  onChange={(v) => setLatticeMode(v as LatticeMode)}
                  options={[
                    { value: "rect", label: "▦ Rect" },
                    { value: "hex", label: "⬡ Hex" },
                    { value: "tri", label: "△ Tri" },
                  ]}
                />
                <Slider
                  label="Grid 1"
                  value={microGrid1}
                  onChange={setMicroGrid1}
                  min={20}
                  max={100}
                  step={5}
                />
                <Slider
                  label="Grid 2"
                  value={microGrid2}
                  onChange={setMicroGrid2}
                  min={100}
                  max={400}
                  step={20}
                />
                <Slider
                  label="Strength"
                  value={microGridStrength}
                  onChange={setMicroGridStrength}
                  min={0}
                  max={1}
                  step={0.05}
                />
                <Slider
                  label="Reveal"
                  value={revealStrength}
                  onChange={setRevealStrength}
                  min={0}
                  max={1}
                  step={0.05}
                />
                <Slider
                  label="Warp"
                  value={microWarp}
                  onChange={setMicroWarp}
                  min={0}
                  max={0.05}
                  step={0.005}
                />
              </ControlPanel>

              {/* Phase Lens Panel */}
              <ControlPanel title="Phase Lens ✨">
                <Toggle label="Enabled" checked={lensEnabled} onChange={setLensEnabled} />
                <Slider
                  label="Radius"
                  value={lensRadius}
                  onChange={setLensRadius}
                  min={0.05}
                  max={0.25}
                  step={0.01}
                />
                <Slider
                  label="Magnify"
                  value={lensMagnification}
                  onChange={setLensMagnification}
                  min={0.5}
                  max={2.0}
                  step={0.1}
                />
                <Slider
                  label="Chromatic"
                  value={lensChromatic}
                  onChange={setLensChromatic}
                  min={0}
                  max={1}
                  step={0.05}
                />
                <Slider
                  label="Inertia"
                  value={lensInertia}
                  onChange={setLensInertia}
                  min={0.05}
                  max={0.5}
                  step={0.02}
                />
                <Slider
                  label="Vel Boost"
                  value={lensVelocityBoost}
                  onChange={setLensVelocityBoost}
                  min={0}
                  max={1}
                  step={0.1}
                />
              </ControlPanel>

              {/* Etch Panel */}
              <ControlPanel title="Etch / Inscription">
                <Slider
                  label="Base Radius"
                  value={etchRadius}
                  onChange={setEtchRadius}
                  min={0.002}
                  max={0.03}
                  step={0.002}
                />
                <Slider
                  label="Strength"
                  value={etchStrength}
                  onChange={setEtchStrength}
                  min={0.1}
                  max={1}
                  step={0.05}
                />
                <Slider
                  label="Decay"
                  value={etchDecay}
                  onChange={setEtchDecay}
                  min={0}
                  max={0.1}
                  step={0.005}
                />
                <Slider
                  label="Distort"
                  value={etchDistortion}
                  onChange={setEtchDistortion}
                  min={0}
                  max={0.02}
                  step={0.002}
                />
                <Toggle label="Freeze Etch" checked={etchFreeze} onChange={setEtchFreeze} />
                <Toggle label="Scribble Mode" checked={scribbleMode} onChange={setScribbleMode} />
                <div className="mt-2 pt-2 border-t border-slate-700/50">
                  <div className="text-[10px] text-slate-500 mb-1">Velocity Taper</div>
                  <Slider
                    label="Min Radius"
                    value={etchRadiusMin}
                    onChange={setEtchRadiusMin}
                    min={0.001}
                    max={0.01}
                    step={0.001}
                  />
                  <Slider
                    label="Max Radius"
                    value={etchRadiusMax}
                    onChange={setEtchRadiusMax}
                    min={0.01}
                    max={0.03}
                    step={0.002}
                  />
                  <Slider
                    label="Vel Scale"
                    value={etchVelocityScale}
                    onChange={setEtchVelocityScale}
                    min={0}
                    max={1}
                    step={0.1}
                  />
                </div>
                <button
                  onClick={() => setFieldKey((k) => k + 1)}
                  className="mt-2 w-full px-3 py-1.5 rounded bg-red-600/80 hover:bg-red-500 text-white text-xs font-medium transition-colors"
                >
                  Clear Etch
                </button>
              </ControlPanel>

              {/* Palette / Atmosphere Panel (Museum-Grade) */}
              <ControlPanel title="Palette / Atmosphere ✨">
                <SelectControl
                  label="Palette"
                  value={paletteMode}
                  onChange={(v) => setPaletteMode(v as PaletteMode)}
                  options={[
                    { value: "glia-cyan", label: "🌊 Glia Cyan" },
                    { value: "orchid", label: "🔮 Orchid" },
                    { value: "amber", label: "🌅 Amber" },
                    { value: "mono", label: "💚 Mono" },
                    { value: "ice", label: "❄️ Ice" },
                  ]}
                />
                <Slider
                  label="Accent"
                  value={accentIntensity}
                  onChange={setAccentIntensity}
                  min={0}
                  max={2}
                  step={0.1}
                />
                <div className="mt-2 pt-2 border-t border-slate-700/50">
                  <div className="text-[10px] text-slate-500 mb-1">Iridescence</div>
                  <Slider
                    label="Strength"
                    value={iridescenceStrength}
                    onChange={setIridescenceStrength}
                    min={0}
                    max={1}
                    step={0.05}
                  />
                  <Slider
                    label="Scale"
                    value={iridescenceScale}
                    onChange={setIridescenceScale}
                    min={1}
                    max={40}
                    step={1}
                  />
                </div>
                <div className="mt-2 pt-2 border-t border-slate-700/50">
                  <div className="text-[10px] text-slate-500 mb-1">Atmosphere</div>
                  <Slider
                    label="Exposure"
                    value={exposure}
                    onChange={setExposure}
                    min={0.6}
                    max={2}
                    step={0.05}
                  />
                  <Slider
                    label="Filmic"
                    value={filmic}
                    onChange={setFilmic}
                    min={0}
                    max={1}
                    step={0.05}
                  />
                  <Slider
                    label="Grain"
                    value={grainStrength}
                    onChange={setGrainStrength}
                    min={0}
                    max={0.08}
                    step={0.005}
                  />
                  <Slider
                    label="CRT"
                    value={crtStrength}
                    onChange={setCrtStrength}
                    min={0}
                    max={1}
                    step={0.05}
                  />
                  <Slider
                    label="Copper"
                    value={copperStrength}
                    onChange={setCopperStrength}
                    min={0}
                    max={1}
                    step={0.05}
                  />
                </div>
              </ControlPanel>

              {/* Performance Panel */}
              <ControlPanel title="Performance">
                <SelectControl
                  label="RTT Res"
                  value={String(rttResolution)}
                  onChange={(v) => setRttResolution(Number(v))}
                  options={[
                    { value: "256", label: "256" },
                    { value: "512", label: "512" },
                    { value: "1024", label: "1024" },
                  ]}
                />
              </ControlPanel>
            </div>
          </div>

          <StateDisplay />
        </div>
      </FieldProvider>
    );
  },
};

// -----------------------------------------------------------------------------
// Scribble Canvas - Overlay for drawing mode
// -----------------------------------------------------------------------------

function ScribbleCanvas() {
  const { emitHover } = useFieldSurface({
    id: "scribble-canvas",
    enableHover: true,
    enableBurst: false,
    enableLatch: false,
  });

  const [isDrawing, setIsDrawing] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setIsDrawing(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      emitHover(e.clientX, e.clientY, "etch");
    },
    [emitHover]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isDrawing) {
        emitHover(e.clientX, e.clientY, "etch");
      }
    },
    [isDrawing, emitHover]
  );

  const handlePointerUp = useCallback(() => {
    setIsDrawing(false);
  }, []);

  return (
    <div
      className="absolute inset-0 z-10 cursor-crosshair"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{ touchAction: "none" }}
    />
  );
}

// -----------------------------------------------------------------------------
// Control Components for Storybook Panels
// -----------------------------------------------------------------------------

function ControlPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-2 rounded-lg bg-black/70 border border-slate-700/50">
      <div className="text-xs font-semibold text-slate-400 mb-2">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between text-xs text-slate-300">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
      />
    </label>
  );
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <label className="block text-xs text-slate-300">
      <div className="flex justify-between mb-0.5">
        <span>{label}</span>
        <span className="text-slate-500">{value.toFixed(3)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
      />
    </label>
  );
}

function SelectControl({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center justify-between text-xs text-slate-300">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-700 rounded px-2 py-0.5 text-xs border-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
