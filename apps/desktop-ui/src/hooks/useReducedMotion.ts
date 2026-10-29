import { useEffect, useState } from "react";

/** Reduced_Motion = OS preference OR the Settings override (Req 17.6, 17.7). */
export function useReducedMotion(override: boolean): boolean {
  const [os, setOs] = useState<boolean>(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false));
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setOs(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return override || os;
}
