import { cn } from "@/lib/utils";
import { MotionProps, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export interface TypingAnimationProps extends MotionProps {
  children?: string;
  words?: string[];
  className?: string;
  duration?: number;
  typeSpeed?: number;
  deleteSpeed?: number;
  delay?: number;
  pauseDelay?: number;
  loop?: boolean;
  startOnView?: boolean;
  showCursor?: boolean;
  blinkCursor?: boolean;
  cursorStyle?: "line" | "block" | "underscore";
  whitespaceClassName?: string;
  onFinish?: () => void;
}

export const TypingAnimation = ({
  words = [],
  className,
  whitespaceClassName = "whitespace-pre",
  typeSpeed = 50,
  deleteSpeed = 30,
  delay = 0,
  pauseDelay = 1200,
  loop = true,
  showCursor = true,
  blinkCursor = true,
  cursorStyle = "line",
  onFinish,
  ...props
}: TypingAnimationProps) => {
  const [displayText, setDisplayText] = useState("");
  const [wordIndex, setWordIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [started, setStarted] = useState(delay === 0);
  const [isComplete, setIsComplete] = useState(false);
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    if (delay > 0) {
      const timer = setTimeout(() => setStarted(true), delay);
      return () => clearTimeout(timer);
    }
  }, [delay]);

  useEffect(() => {
    if (isComplete || !started) return;

    // Reduced-motion / instant render: if speeds are zero, show full word immediately.
    if (typeSpeed === 0 || deleteSpeed === 0) {
      const currentWord = words[wordIndex] ?? "";
      setDisplayText(currentWord);
      if (!loop && wordIndex === words.length - 1) {
        setIsComplete(true);
        return;
      }
      setIsDeleting(false);
      setWordIndex((prev) => (prev + 1) % words.length);
      return;
    }
    const currentWord = words[wordIndex] ?? "";
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (!isDeleting) {
      if (displayText.length < currentWord.length) {
        timeout = setTimeout(() => {
          setDisplayText(currentWord.slice(0, displayText.length + 1));
        }, typeSpeed);
      } else {
        if (!loop && wordIndex === words.length - 1) {
          const doneTimer = setTimeout(() => setIsComplete(true), pauseDelay);
          return () => clearTimeout(doneTimer);
        }
        timeout = setTimeout(() => setIsDeleting(true), pauseDelay);
      }
    } else {
      if (displayText.length > 0) {
        timeout = setTimeout(() => {
          setDisplayText(currentWord.slice(0, displayText.length - 1));
        }, deleteSpeed);
      } else {
        setIsDeleting(false);
        setWordIndex((prev) => (prev + 1) % words.length);
      }
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [
    displayText,
    isDeleting,
    isComplete,
    started,
    words,
    wordIndex,
    typeSpeed,
    deleteSpeed,
    pauseDelay,
    loop,
  ]);

  useEffect(() => {
    if (isComplete && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
      onFinish?.();
    }
  }, [isComplete, onFinish]);

  const cursorChar = cursorStyle === "block" ? "▮" : cursorStyle === "underscore" ? "_" : "|";

  return (
    <motion.span
      {...props}
      className={cn("relative inline-flex items-center gap-1", whitespaceClassName, className)}
    >
      <span>{displayText}</span>
      {showCursor && (
        <span
          className={cn("inline-block text-cyan-neon", blinkCursor && "animate-pulse")}
          aria-hidden="true"
        >
          {cursorChar}
        </span>
      )}
    </motion.span>
  );
};
