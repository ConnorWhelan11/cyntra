import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export interface GlitchTextProps {
  variants: string[];
  interval?: number;
  className?: string;
  steps?: number;
  onComplete?: () => void;
}

export const GlitchText = ({
  variants,
  interval = 3000,
  className,
  steps,
  onComplete,
}: GlitchTextProps) => {
  const [index, setIndex] = useState(0);
  const [isGlitching, setIsGlitching] = useState(false);
  const [text, setText] = useState(variants[0]);
  const [stepCount, setStepCount] = useState(0);

  useEffect(() => {
    if (typeof steps === "number" && stepCount >= steps) {
      setIndex(variants.length - 1);
      setText(variants[variants.length - 1]);
      setIsGlitching(false);
      onComplete?.();
      return;
    }

    const timer = setInterval(() => {
      setIsGlitching(true);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % variants.length);
        setStepCount((prev) => prev + 1);
        setIsGlitching(false);
      }, 400); // Glitch duration
    }, interval);

    return () => clearInterval(timer);
  }, [variants, interval, steps, stepCount, onComplete]);

  // Simple glitch text effect during transition
  useEffect(() => {
    if (isGlitching) {
      const glitchInterval = setInterval(() => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890!@#$%^&*()";
        const currentTarget = variants[(index + 1) % variants.length];
        const randomText = currentTarget
          .split("")
          .map((char) =>
            Math.random() > 0.5
              ? chars[Math.floor(Math.random() * chars.length)]
              : char
          )
          .join("");
        setText(randomText);
      }, 50);
      return () => clearInterval(glitchInterval);
    } else {
      setText(variants[index]);
    }
  }, [isGlitching, index, variants]);

  return (
    <span className={cn("relative inline-block", className)}>
      <span
        className={cn(
          "block",
          isGlitching && "animate-glitch text-cyan-neon blur-[0.5px]"
        )}
      >
        {text}
      </span>
      {isGlitching && (
        <>
          <span
            className="absolute top-0 left-0 -ml-[2px] text-red-500 opacity-70 animate-glitch"
            aria-hidden="true"
          >
            {text}
          </span>
          <span
            className="absolute top-0 left-0 ml-[2px] text-blue-500 opacity-70 animate-glitch"
            aria-hidden="true"
          >
            {text}
          </span>
        </>
      )}
    </span>
  );
};
