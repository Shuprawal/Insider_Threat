import React from "react";
import { createPortal } from "react-dom";

export default function EmergencyOverlay({ active, flash }) {
  if (!active) return null;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const a = flash?.colorA || "#ffffff";
  const b = flash?.colorB || "#b91c1c";
  const opacity = Number(flash?.opacity ?? 0.35);
  const speedMs = Number(flash?.speedMs ?? 700);

  const style = {
    position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483647,
    background: a,
    opacity,
    animation: reduce ? "none" : `im-strobe ${Math.max(100, speedMs)}ms steps(2, jump-none) infinite`,
    mixBlendMode: "normal",
  };

  // Inject dynamic keyframes for current colors
  const keyframes = `
    @keyframes im-strobe {
      0% { background: ${a}; }
      50% { background: ${b}; }
      100% { background: ${a}; }
    }`;

  return createPortal(
    <>
      <style>{keyframes}</style>
      <div style={style} />
    </>,
    document.body
  );
}
