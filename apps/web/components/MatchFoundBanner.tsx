"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * Slams in when phase first becomes "matched". Auto-dismisses after ~1.4s.
 * Use as a sibling to the play frame; it positions itself fixed over the viewport.
 */
export function MatchFoundBanner({ active }: { active: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!active) return;
    setShow(true);
    // No cleanup — we WANT the timer to fire even if `active` flips to
    // false mid-window (e.g., phase moves matched → revealing within ms).
    // Without this, clearTimeout cancels the auto-hide and the banner sticks.
    const t = setTimeout(() => setShow(false), 1400);
    return () => {
      // Don't clear the timer — let it run. We just need to make sure if
      // active toggles back on within the window we don't double-fire.
      // Clearing show here is wrong; the timer will hide it.
      void t;
    };
  }, [active]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="banner"
          className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* shockwave rings */}
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute h-2 w-2 rounded-full"
              style={{
                background: "transparent",
                border: "2px solid #ff2bd6",
              }}
              initial={{ scale: 0, opacity: 0.9 }}
              animate={{ scale: 80 + i * 20, opacity: 0 }}
              transition={{
                duration: 1.0,
                delay: i * 0.12,
                ease: "easeOut",
              }}
            />
          ))}

          {/* slam-in label */}
          <motion.div
            className="relative px-10 py-6 bg-bg-base border-2 border-magenta"
            style={{
              clipPath:
                "polygon(0 6px, 6px 6px, 6px 0, calc(100% - 6px) 0, calc(100% - 6px) 6px, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 6px calc(100% - 6px), 0 calc(100% - 6px))",
              boxShadow:
                "0 0 0 1px #ff2bd6, 0 0 24px #ff2bd680, 0 0 64px #ff2bd640",
            }}
            initial={{ scale: 1.6, y: -40, opacity: 0 }}
            animate={{
              scale: [1.6, 0.92, 1.04, 1],
              y: 0,
              opacity: 1,
            }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ duration: 0.5, ease: [0.2, 0.9, 0.3, 1.4] }}
          >
            <div className="text-pixel-md glow-magenta tracking-widest">
              ▶ OPPONENT LOCKED IN
            </div>
            <div className="text-pixel-xs text-ink-mute mt-2 text-center">
              MATCH CREATED // PREPARING REVEAL
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
