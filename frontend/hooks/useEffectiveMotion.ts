"use client";

import { useEffect, useState } from "react";

import type { MotionMode } from "@/lib/settings";

/**
 * Whether decorative motion should run (fireflies, etc.).
 */
export function useEffectiveMotion(motionMode: MotionMode): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    if (motionMode === "reduced") {
      setReduce(true);
      return;
    }
    if (motionMode === "full") {
      setReduce(false);
      return;
    }

    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const sync = () => {
        setReduce(mq.matches);
      };
      sync();

      if (typeof mq.addEventListener === "function") {
        mq.addEventListener("change", sync);
        return () => mq.removeEventListener("change", sync);
      }

      // Safari < 14 / legacy: MediaQueryList#addListener
      mq.addListener(sync);
      return () => mq.removeListener(sync);
    } catch {
      setReduce(true);
    }
  }, [motionMode]);

  return !reduce;
}
