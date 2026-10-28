"use client";

import { animate, useMotionValue, useMotionValueEvent } from "motion/react";
import { useEffect, useState } from "react";

/** How long a figure takes to reach its new value: a count, not a bounce (canvas brief). */
const DURATION_S = 0.4;

/**
 * A summary figure that counts from its last value to the new one when it changes, and swaps at
 * once with reduced motion (canvas brief, "Live recalculation"). It starts at its value, so the
 * server and the first render show the same text; screen readers hear the change from the
 * summary's live region, not the count.
 */
export function CountUp({ value, format }: { value: number; format: (value: number) => string }) {
  const current = useMotionValue(value);
  const [shown, setShown] = useState(value);
  useMotionValueEvent(current, "change", setShown);

  useEffect(() => {
    if (current.get() === value) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.jump(value);
      return;
    }
    const controls = animate(current, value, { duration: DURATION_S, ease: "easeOut" });
    return () => controls.stop();
  }, [current, value]);

  return format(shown);
}
