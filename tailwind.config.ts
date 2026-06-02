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
        // Surfaces — sunken → canvas → raised → floating
        vellum: {
          DEFAULT: "var(--color-vellum)",
          deep: "var(--color-vellum-deep)",
        },
        veil: {
          DEFAULT: "var(--color-veil)",
          raised: "var(--color-veil-raised)",
        },
        ink: {
          DEFAULT: "var(--color-ink)",
          soft: "var(--color-ink-soft)",
        },
        line: {
          DEFAULT: "var(--color-line)",
          strong: "var(--color-line-strong)",
        },
        // Action voice
        espresso: {
          DEFAULT: "var(--color-espresso)",
          deep: "var(--color-espresso-deep)",
          soft: "var(--color-espresso-soft)",
        },
        // Warm secondary metal
        gold: {
          DEFAULT: "var(--color-gold)",
          soft: "var(--color-gold-soft)",
          "soft-strong": "var(--color-gold-soft-strong)",
        },
        // Content jewel tone (cover washes, accents) — never chrome
        oxblood: {
          DEFAULT: "var(--color-oxblood)",
          soft: "var(--color-oxblood-soft)",
        },
        // Semantic aliases — primary is the action voice (espresso).
        primary: {
          DEFAULT: "var(--color-espresso)",
          deep: "var(--color-espresso-deep)",
          soft: "var(--color-espresso-soft)",
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
        lift: "var(--shadow-lift)",
        raised: "var(--shadow-raised)",
        float: "var(--shadow-float)",
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
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
