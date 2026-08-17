"use client";

import { useEffect, useRef } from "react";

/**
 * A grid of small squares that flicker independently — the "live data
 * board" texture common to fintech/terminal UIs (Magic UI's Flickering Grid
 * is the well-known reference point; this is a from-scratch canvas
 * implementation sized for this hero rather than a copy of theirs).
 *
 * Canvas + a plain interval rather than DOM nodes or requestAnimationFrame:
 * a screen-filling grid at a useful cell size is hundreds of squares, and
 * the flicker itself is a slow, low-frequency effect — redrawing at ~15fps
 * from setInterval looks identical to 60fps rAF here and costs a fraction
 * of the work. `prefers-reduced-motion` draws exactly one static frame and
 * never starts the interval.
 */
export function FlickeringGrid({
  squareSize = 3,
  gridGap = 7,
  color = "255, 255, 255",
  maxOpacity = 0.22,
  flickerChance = 0.12,
  className,
}: {
  squareSize?: number;
  gridGap?: number;
  color?: string; // "r, g, b"
  maxOpacity?: number;
  flickerChance?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cell = squareSize + gridGap;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cols = 0;
    let rows = 0;
    let opacities = new Float32Array(0);
    let intervalId: ReturnType<typeof setInterval> | undefined;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx.fillStyle = "rgb(0 0 0 / 0)"; // reset, overwritten per-cell below
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const o = opacities[y * cols + x];
          if (o <= 0.005) continue;
          ctx.fillStyle = `rgba(${color}, ${o.toFixed(3)})`;
          ctx.fillRect(x * cell * dpr, y * cell * dpr, squareSize * dpr, squareSize * dpr);
        }
      }
    }

    function tick() {
      for (let i = 0; i < opacities.length; i++) {
        if (Math.random() < flickerChance) {
          opacities[i] = Math.random() * maxOpacity;
        }
      }
      draw();
    }

    function resize() {
      const { width, height } = container!.getBoundingClientRect();
      canvas!.width = Math.max(1, Math.floor(width * dpr));
      canvas!.height = Math.max(1, Math.floor(height * dpr));
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      cols = Math.ceil(width / cell);
      rows = Math.ceil(height / cell);
      const next = new Float32Array(cols * rows);
      for (let i = 0; i < next.length; i++) {
        next[i] = Math.random() * maxOpacity;
      }
      opacities = next;
      draw();
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    if (!reduceMotion) {
      intervalId = setInterval(tick, 70);
    }

    return () => {
      ro.disconnect();
      if (intervalId) clearInterval(intervalId);
    };
  }, [squareSize, gridGap, color, maxOpacity, flickerChance]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
