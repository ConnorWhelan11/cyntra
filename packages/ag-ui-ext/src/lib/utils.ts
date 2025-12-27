import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate neon glow shadow styles
 */
export function glow(
  color: "cyan" | "magenta" | "emerald" = "cyan",
  intensity: "low" | "medium" | "high" = "medium"
) {
  const colorMap = {
    cyan: "var(--cyan-neon)",
    magenta: "var(--magenta-neon)",
    emerald: "var(--emerald-neon)",
  };

  const intensityMap = {
    low: "0 0 10px",
    medium: "0 0 20px, 0 0 40px",
    high: "0 0 20px, 0 0 40px, 0 0 80px",
  };

  const hslColor = `hsl(${colorMap[color]})`;
  return `${intensityMap[intensity]} ${hslColor}`;
}

/**
 * Generate HUD-style conic gradient for progress rings
 */
export function hudGrad(
  progress: number = 0.75,
  colors?: { start?: string; middle?: string; end?: string }
) {
  const defaultColors = {
    start: "hsl(var(--cyan-neon))",
    middle: "hsl(var(--magenta-neon))",
    end: "hsl(var(--emerald-neon))",
  };

  const gradColors = { ...defaultColors, ...colors };
  const progressDeg = progress * 360;

  return `conic-gradient(from 0deg at 50% 50%, ${gradColors.start} 0deg, ${
    gradColors.middle
  } ${progressDeg / 2}deg, ${
    gradColors.end
  } ${progressDeg}deg, transparent ${progressDeg}deg, transparent 360deg)`;
}

/**
 * Format numbers with appropriate suffixes (K, M, B)
 */
export function formatNumber(num: number): string {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + "B";
  if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
  return num.toString();
}

/**
 * Animate number changes with a spring-like effect
 */
export function animateNumber(
  from: number,
  to: number,
  duration: number = 1000,
  onUpdate: (value: number) => void,
  easing: (t: number) => number = (t) => t * (2 - t) // ease-out quad
) {
  const startTime = Date.now();
  const delta = to - from;

  const animate = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easing(progress);
    const currentValue = from + delta * easedProgress;

    onUpdate(Math.round(currentValue));

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };

  requestAnimationFrame(animate);
}

/**
 * Animate float changes without rounding (for smooth SVG/progress animations)
 */
export function animateFloat(
  from: number,
  to: number,
  duration: number = 1000,
  onUpdate: (value: number) => void,
  easing: (t: number) => number = (t) => t * (2 - t)
) {
  const startTime = Date.now();
  const delta = to - from;

  const animate = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easing(progress);
    const currentValue = from + delta * easedProgress;

    onUpdate(currentValue);

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };

  requestAnimationFrame(animate);
}

/**
 * Debounce function for search/input handling
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
