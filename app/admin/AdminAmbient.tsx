"use client";

import { useEffect, useRef } from "react";

export default function AdminAmbient() {
  const glowRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const glow = glowRef.current;

    if (!glow) {
      return;
    }

    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        return;
      }

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = requestAnimationFrame(() => {
        glow.style.transform = `translate3d(${event.clientX - 190}px, ${event.clientY - 190}px, 0)`;
        glow.style.opacity = "1";
      });
    };

    const hide = () => {
      glow.style.opacity = "0";
    };

    window.addEventListener("pointermove", move, {
      passive: true,
    });
    document.documentElement.addEventListener("mouseleave", hide);

    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("mouseleave", hide);

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={glowRef}
      aria-hidden="true"
      className="admin-cursor-glow pointer-events-none fixed left-0 top-0 z-0 h-[380px] w-[380px] rounded-full opacity-0"
    />
  );
}
