import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "monospace"],
        body: ["var(--font-body)", "monospace"],
        mono: ["var(--font-mono)", "monospace"],
      },
      colors: {
        bg: {
          base: "#0a0e1a",
          alt: "#131826",
          elev: "#1a1f2e",
          deep: "#05070d",
        },
        ink: {
          DEFAULT: "#e0e0ff",
          dim: "#a0a4c0",
          mute: "#6a6e8a",
          shadow: "#3a3f5a",
        },
        magenta: {
          DEFAULT: "#ff2bd6",
          glow: "#ff2bd6",
          deep: "#a01088",
        },
        cyan: {
          DEFAULT: "#00f5d4",
          deep: "#008f7f",
        },
        acid: {
          DEFAULT: "#fffb00",
          deep: "#a8a500",
        },
        burn: {
          DEFAULT: "#ff003c",
          deep: "#a00026",
        },
        ok: {
          DEFAULT: "#00ff88",
          deep: "#008844",
        },
        edge: {
          DEFAULT: "#2a3349",
          bright: "#4a5379",
        },
      },
      boxShadow: {
        "glow-magenta": "0 0 0 1px #ff2bd6, 0 0 12px #ff2bd640, 0 0 32px #ff2bd620",
        "glow-cyan": "0 0 0 1px #00f5d4, 0 0 12px #00f5d440, 0 0 32px #00f5d420",
        "glow-acid": "0 0 0 1px #fffb00, 0 0 12px #fffb0040, 0 0 32px #fffb0020",
        "glow-burn": "0 0 0 1px #ff003c, 0 0 12px #ff003c40, 0 0 32px #ff003c20",
        "glow-ok": "0 0 0 1px #00ff88, 0 0 12px #00ff8840, 0 0 32px #00ff8820",
        "inset-grid": "inset 0 0 0 1px #2a3349",
      },
      animation: {
        scanlines: "scanlines 8s linear infinite",
        flicker: "flicker 4s linear infinite",
        glitch: "glitch 0.3s steps(2) infinite",
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "marquee": "marquee 30s linear infinite",
        "blink": "blink 1.1s steps(2) infinite",
      },
      keyframes: {
        scanlines: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "0 100vh" },
        },
        flicker: {
          "0%,100%": { opacity: "1" },
          "97%": { opacity: "1" },
          "97.5%": { opacity: "0.85" },
          "98%": { opacity: "1" },
          "98.5%": { opacity: "0.92" },
          "99%": { opacity: "1" },
        },
        glitch: {
          "0%,100%": { transform: "translate(0)" },
          "20%": { transform: "translate(-1px, 1px)" },
          "40%": { transform: "translate(-1px, -1px)" },
          "60%": { transform: "translate(1px, 1px)" },
          "80%": { transform: "translate(1px, -1px)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        blink: {
          "0%,49%": { opacity: "1" },
          "50%,100%": { opacity: "0" },
        },
      },
      backgroundImage: {
        "pixel-grid":
          "linear-gradient(to right, #2a334933 1px, transparent 1px), linear-gradient(to bottom, #2a334933 1px, transparent 1px)",
      },
      backgroundSize: {
        "pixel-grid": "8px 8px",
      },
    },
  },
  plugins: [],
} satisfies Config;
