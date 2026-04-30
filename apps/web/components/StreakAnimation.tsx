"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * Fires a particle burst when `streak` crosses 3, 5, 10. Driven by changes
 * to `streak`, not local state — single source of truth is the on-chain
 * `PlayerStats.current_streak` field.
 */
export function StreakAnimation({ streak }: { streak: number }) {
  const [show, setShow] = useState<{ key: number; tier: number } | null>(null);
  const [prevStreak, setPrevStreak] = useState(streak);

  useEffect(() => {
    const tier =
      streak >= 10 && prevStreak < 10
        ? 10
        : streak >= 5 && prevStreak < 5
        ? 5
        : streak >= 3 && prevStreak < 3
        ? 3
        : 0;
    if (tier > 0) {
      setShow({ key: Date.now(), tier });
      const t = setTimeout(() => setShow(null), 2400);
      return () => clearTimeout(t);
    }
    setPrevStreak(streak);
  }, [streak, prevStreak]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={show.key}
          className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <FireRing tier={show.tier} />
          <Banner tier={show.tier} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Banner({ tier }: { tier: number }) {
  const label = tier >= 10 ? "DOUBLE-DIGIT" : tier >= 5 ? "ON FIRE" : "STREAK";
  return (
    <motion.div
      className="absolute"
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: [0.5, 1.2, 1], opacity: 1 }}
      exit={{ scale: 1.4, opacity: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className="text-center">
        <div className="text-pixel-xl glow-acid">×{tier}</div>
        <div className="text-pixel-md glow-magenta mt-2">{label}</div>
      </div>
    </motion.div>
  );
}

function FireRing({ tier }: { tier: number }) {
  const count = tier >= 10 ? 24 : tier >= 5 ? 16 : 12;
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const radius = 320;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        return (
          <motion.div
            key={i}
            className="absolute h-3 w-3"
            style={{ background: i % 2 === 0 ? "#ff2bd6" : "#fffb00" }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x,
              y,
              opacity: 0,
              scale: [1, 2, 0.5],
              boxShadow: [
                "0 0 8px #ff2bd6",
                "0 0 24px #ff2bd6",
                "0 0 0 #ff2bd6",
              ],
            }}
            transition={{ duration: 1.6, ease: "easeOut" }}
          />
        );
      })}
    </>
  );
}
