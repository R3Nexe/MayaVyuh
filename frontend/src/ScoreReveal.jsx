/* eslint-disable */
import { useState, useEffect } from "react";

const JITTER_INTERVAL_MS = 100;
const JITTER_MIN = 40;
const JITTER_MAX = 95;
const randomJitterValue = () => JITTER_MIN + Math.random() * (JITTER_MAX - JITTER_MIN);

export function useScoreJitter(active) {
  const [value, setValue] = useState(randomJitterValue);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setValue(randomJitterValue()), JITTER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active]);

  return value;
}

// status: 'pending' | 'revealed'
export function ScoreDigits({ status, score, size = 84, revealedColor = "var(--neon-gold)", pendingColor = "var(--neon-cyan)", style }) {
  const jitterValue = useScoreJitter(status === "pending");
  const isRevealed = status === "revealed";
  const display = isRevealed ? score : jitterValue;

  return (
    <div
      style={{
        fontSize: size,
        fontFamily: "'Orbitron'",
        fontWeight: 900,
        lineHeight: 1,
        color: isRevealed ? revealedColor : pendingColor,
        textShadow: isRevealed ? `0 0 35px ${revealedColor}` : "none",
        filter: isRevealed ? "blur(0px)" : "blur(8px)",
        transition: "filter 1.5s ease, color 1.5s ease",
        ...style,
      }}
    >
      {(display || 0).toFixed(1)}%
    </div>
  );
}
