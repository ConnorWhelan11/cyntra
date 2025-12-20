"use client";

import { cn } from "@/lib/utils";
import { ArrowRight, Chrome } from "lucide-react";
import { useEffect, useRef } from "react";

export function SideglyphCard({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let time = 0;
    let animationFrameId: number;

    const waveData = Array.from({ length: 8 }).map(() => ({
      value: Math.random() * 0.5 + 0.1,
      targetValue: Math.random() * 0.5 + 0.1,
      speed: Math.random() * 0.02 + 0.01,
    }));

    function resizeCanvas() {
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    }

    function updateWaveData() {
      waveData.forEach((data) => {
        if (Math.random() < 0.01) data.targetValue = Math.random() * 0.7 + 0.1;
        const diff = data.targetValue - data.value;
        data.value += diff * data.speed;
      });
    }

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Transparent background instead of black
      // ctx.fillStyle = 'black';
      // ctx.fillRect(0, 0, canvas.width, canvas.height);

      waveData.forEach((data, i) => {
        const freq = data.value * 7;
        ctx.beginPath();
        for (let x = 0; x < canvas.width; x++) {
          const nx = (x / canvas.width) * 2 - 1;
          const px = nx + i * 0.04 + freq * 0.03;
          const py =
            Math.sin(px * 10 + time) *
            Math.cos(px * 2) *
            freq *
            0.1 *
            ((i + 1) / 8);
          const y = ((py + 1) * canvas.height) / 2;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        const intensity = Math.min(1, freq * 0.3);
        // Indigo/Purple colors from snippet
        const r = 79 + intensity * 100;
        const g = 70 + intensity * 130;
        const b = 229;

        ctx.lineWidth = 1 + i * 0.3;
        ctx.strokeStyle = `rgba(${r},${g},${b},0.6)`;
        ctx.shadowColor = `rgba(${r},${g},${b},0.5)`;
        ctx.shadowBlur = 5;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });
    }

    function animate() {
      time += 0.02;
      updateWaveData();
      draw();
      animationFrameId = requestAnimationFrame(animate);
    }

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-indigo-500/30 bg-indigo-500/5 backdrop-blur-md transition-all duration-300 hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:shadow-[0_0_30px_rgba(99,102,241,0.2)]",
        className
      )}
    >
      {/* Canvas Background (Wave) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full opacity-40 pointer-events-none"
      />

      {/* Grid Background */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div
          className="w-full h-full animate-pulse"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px)",
            backgroundSize: "15px 15px",
          }}
        />
      </div>

      {/* Content Wrapper */}
      <div className="relative z-10 flex flex-col h-full justify-between">
        <div className="p-6">
          {/* Header */}
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20 transition-colors group-hover:bg-indigo-500/20">
                <Chrome className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-white">
                  Sideglyph
                </h3>
                <p className="text-xs font-medium text-slate-500">
                  Browser Extension
                </p>
              </div>
            </div>
            {/* Status Indicator */}
            <div className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-wider bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/20">
              Not connected
            </div>
          </div>

          <p className="mb-6 text-sm leading-relaxed text-slate-300 group-hover:text-white transition-colors">
            Turn any tab into a mission. Capture pages, threads, and docs and
            we’ll weave them into your Out-of-Scope universe.
          </p>

          {/* Scopes */}
          <div className="flex flex-wrap gap-2 mb-6">
            {["URLs", "Highlights", "Screenshots"].map((scope) => (
              <span
                key={scope}
                className="rounded-md bg-indigo-500/10 px-2 py-1 text-[10px] font-medium text-indigo-300 transition-colors group-hover:bg-indigo-500/20 group-hover:text-indigo-200"
              >
                {scope}
              </span>
            ))}
          </div>
        </div>

        {/* Separator */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />

        {/* Action Button Area */}
        <div className="p-6 pt-4">
          <button className="group/btn flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-all bg-indigo-500/10 text-indigo-100 border border-indigo-500/20 hover:bg-indigo-500/20 hover:text-white hover:border-indigo-500/40">
            <span>Install extension</span>
            <ArrowRight className="h-4 w-4 text-indigo-400 transition-transform group-hover/btn:translate-x-1 group-hover/btn:text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
