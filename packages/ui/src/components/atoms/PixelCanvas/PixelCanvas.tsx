"use client";

import * as React from "react";

// Pixel class for the canvas animation
class Pixel {
  width: number;
  height: number;
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  color: string;
  speed: number;
  size: number;
  sizeStep: number;
  minSize: number;
  maxSizeInteger: number;
  maxSize: number;
  delay: number;
  counter: number;
  counterStep: number;
  isIdle: boolean;
  isReverse: boolean;
  isShimmer: boolean;

  constructor(
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    speed: number,
    delay: number
  ) {
    this.width = canvas.width;
    this.height = canvas.height;
    this.ctx = context;
    this.x = x;
    this.y = y;
    this.color = color;
    this.speed = this.getRandomValue(0.1, 0.9) * speed;
    this.size = 0;
    this.sizeStep = Math.random() * 0.4;
    this.minSize = 0.5;
    this.maxSizeInteger = 2;
    this.maxSize = this.getRandomValue(this.minSize, this.maxSizeInteger);
    this.delay = delay;
    this.counter = 0;
    this.counterStep = Math.random() * 4 + (this.width + this.height) * 0.01;
    this.isIdle = false;
    this.isReverse = false;
    this.isShimmer = false;
  }

  getRandomValue(min: number, max: number) {
    return Math.random() * (max - min) + min;
  }

  draw() {
    const centerOffset = this.maxSizeInteger * 0.5 - this.size * 0.5;
    this.ctx.fillStyle = this.color;
    this.ctx.fillRect(
      this.x + centerOffset,
      this.y + centerOffset,
      this.size,
      this.size
    );
  }

  appear() {
    this.isIdle = false;

    if (this.counter <= this.delay) {
      this.counter += this.counterStep;
      return;
    }

    if (this.size >= this.maxSize) {
      this.isShimmer = true;
    }

    if (this.isShimmer) {
      this.shimmer();
    } else {
      this.size += this.sizeStep;
    }

    this.draw();
  }

  disappear() {
    this.isShimmer = false;
    this.counter = 0;

    if (this.size <= 0) {
      this.isIdle = true;
      return;
    } else {
      this.size -= 0.1;
    }

    this.draw();
  }

  shimmer() {
    if (this.size >= this.maxSize) {
      this.isReverse = true;
    } else if (this.size <= this.minSize) {
      this.isReverse = false;
    }

    if (this.isReverse) {
      this.size -= this.speed;
    } else {
      this.size += this.speed;
    }
  }
}

export interface PixelCanvasProps extends React.HTMLAttributes<HTMLDivElement> {
  gap?: number;
  speed?: number;
  colors?: string[];
  variant?: "default" | "icon";
  noFocus?: boolean;
}

const PixelCanvas = React.forwardRef<HTMLDivElement, PixelCanvasProps>(
  (
    {
      gap = 5,
      speed = 35,
      colors = ["#f8fafc", "#f1f5f9", "#cbd5e1"],
      variant = "default",
      noFocus = false,
      className,
      ...props
    },
    ref
  ) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const pixelsRef = React.useRef<Pixel[]>([]);
    const animationRef = React.useRef<number | null>(null);
    const timePreviousRef = React.useRef<number>(performance.now());
    const timeInterval = 1000 / 60;

    const reducedMotion =
      typeof window !== "undefined"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;

    const actualSpeed = reducedMotion
      ? 0
      : Math.max(0, Math.min(100, speed)) * 0.001;
    const actualGap = Math.max(4, Math.min(50, gap));

    const getDistanceToCenter = React.useCallback(
      (x: number, y: number, width: number, height: number) => {
        const dx = x - width / 2;
        const dy = y - height / 2;
        return Math.sqrt(dx * dx + dy * dy);
      },
      []
    );

    const getDistanceToBottomLeft = React.useCallback(
      (x: number, y: number, height: number) => {
        const dx = x;
        const dy = height - y;
        return Math.sqrt(dx * dx + dy * dy);
      },
      []
    );

    const createPixels = React.useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      pixelsRef.current = [];

      for (let x = 0; x < canvas.width; x += actualGap) {
        for (let y = 0; y < canvas.height; y += actualGap) {
          const color = colors[Math.floor(Math.random() * colors.length)];
          let delay = 0;

          if (variant === "icon") {
            delay = reducedMotion
              ? 0
              : getDistanceToCenter(x, y, canvas.width, canvas.height);
          } else {
            delay = reducedMotion
              ? 0
              : getDistanceToBottomLeft(x, y, canvas.height);
          }

          pixelsRef.current.push(
            new Pixel(canvas, ctx, x, y, color, actualSpeed, delay)
          );
        }
      }
    }, [
      actualGap,
      actualSpeed,
      colors,
      variant,
      reducedMotion,
      getDistanceToCenter,
      getDistanceToBottomLeft,
    ]);

    const drawStatic = React.useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const pixel of pixelsRef.current) {
        pixel.isIdle = true;
        pixel.isReverse = false;
        pixel.isShimmer = false;
        pixel.size = pixel.maxSize;
        pixel.draw();
      }
    }, []);

    const handleResize = React.useCallback(() => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!container || !canvas || !ctx) return;

      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      createPixels();
      if (reducedMotion) {
        drawStatic();
      }
    }, [createPixels, reducedMotion, drawStatic]);

    const handleAnimation = React.useCallback(
      (name: "appear" | "disappear") => {
        if (reducedMotion) {
          return;
        }
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;

        const animate = () => {
          animationRef.current = requestAnimationFrame(animate);

          const timeNow = performance.now();
          const timePassed = timeNow - timePreviousRef.current;

          if (timePassed < timeInterval) return;

          timePreviousRef.current = timeNow - (timePassed % timeInterval);

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          let allIdle = true;
          for (const pixel of pixelsRef.current) {
            pixel[name]();
            if (!pixel.isIdle) allIdle = false;
          }

          if (allIdle) {
            if (animationRef.current) {
              cancelAnimationFrame(animationRef.current);
              animationRef.current = null;
            }
          }
        };

        animate();
      },
      [reducedMotion]
    );

    React.useEffect(() => {
      handleResize();

      const ro = new ResizeObserver(() => {
        requestAnimationFrame(handleResize);
      });

      if (containerRef.current) {
        ro.observe(containerRef.current);
      }

      return () => {
        ro.disconnect();
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }, [handleResize]);

    React.useEffect(() => {
      const parent = containerRef.current?.parentElement;
      if (!parent) return;
      if (reducedMotion) return;

      const handleEnter = () => handleAnimation("appear");
      const handleLeave = () => handleAnimation("disappear");

      parent.addEventListener("mouseenter", handleEnter);
      parent.addEventListener("mouseleave", handleLeave);

      if (!noFocus) {
        parent.addEventListener("focus", handleEnter, { capture: true });
        parent.addEventListener("blur", handleLeave, { capture: true });
      }

      return () => {
        parent.removeEventListener("mouseenter", handleEnter);
        parent.removeEventListener("mouseleave", handleLeave);
        if (!noFocus) {
          parent.removeEventListener("focus", handleEnter, { capture: true });
          parent.removeEventListener("blur", handleLeave, { capture: true });
        }
      };
    }, [handleAnimation, noFocus, reducedMotion]);

    return (
      <div
        ref={(node) => {
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        className={className}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
        {...props}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
          }}
        />
      </div>
    );
  }
);

PixelCanvas.displayName = "PixelCanvas";

export { PixelCanvas };
