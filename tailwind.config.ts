import type { Config } from "tailwindcss";

// Palette maps to the OKLCH CSS variables defined in src/app/globals.css.
// One source of truth: edit token values there, not here. See DESIGN.md.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        plaster: "var(--color-plaster)",
        chalk: "var(--color-chalk)",
        ink: {
          DEFAULT: "var(--color-ink)",
          soft: "var(--color-ink-soft)",
        },
        line: "var(--color-line)",
        verdigris: {
          DEFAULT: "var(--color-verdigris)",
          deep: "var(--color-verdigris-deep)",
          soft: "var(--color-verdigris-soft)",
        },
        clay: {
          DEFAULT: "var(--color-clay)",
          soft: "var(--color-clay-soft)",
          "soft-strong": "var(--color-clay-soft-strong)",
        },
        // Semantic aliases — primary is the action voice (verdigris).
        primary: {
          DEFAULT: "var(--color-verdigris)",
          deep: "var(--color-verdigris-deep)",
          soft: "var(--color-verdigris-soft)",
        },
        success: {
          DEFAULT: "var(--color-success)",
          soft: "var(--color-success-soft)",
          deep: "var(--color-success-deep)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          soft: "var(--color-warning-soft)",
          deep: "var(--color-warning-deep)",
        },
        error: {
          DEFAULT: "var(--color-error)",
          soft: "var(--color-error-soft)",
          deep: "var(--color-error-deep)",
        },
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-hanken)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        lift: "0 2px 8px oklch(0.25 0.02 50 / 0.06)",
        raised: "0 8px 28px oklch(0.25 0.02 50 / 0.10)",
      },
      borderRadius: {
        // Semantic radii (DESIGN.md): controls 10px, cards 16px (cozier).
        control: "10px",
        card: "16px",
      },
      transitionTimingFunction: {
        gentle: "var(--ease-gentle)",
      },
    },
  },
  plugins: [],
};
export default config;
