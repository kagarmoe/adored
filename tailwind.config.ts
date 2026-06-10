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
        // === Luminous role-based tokens ===
        ground: "var(--color-ground)",
        surface: {
          DEFAULT: "var(--color-surface)",
          raised: "var(--color-surface-raised)",
        },
        hairline: "var(--color-hairline)",
        accent: {
          aqua: "var(--color-accent-aqua)",
          sky: "var(--color-accent-sky)",
          cornflower: "var(--color-accent-cornflower)",
          periwinkle: "var(--color-accent-periwinkle)",
        },
        spark: {
          DEFAULT: "var(--color-spark)",
          ink: "var(--color-spark-ink)",
        },
        decor: "var(--color-decor)",
        info: {
          DEFAULT: "var(--color-info)",
          soft: "var(--color-info-soft)",
          deep: "var(--color-info-deep)",
        },
        tier: {
          love: "var(--color-tier-love)",
          like: "var(--color-tier-like)",
          maybe: "var(--color-tier-maybe)",
          onward: "var(--color-tier-onward)",
          "love-ink": "var(--color-tier-love-ink)",
          "like-ink": "var(--color-tier-like-ink)",
          "maybe-ink": "var(--color-tier-maybe-ink)",
          "onward-ink": "var(--color-tier-onward-ink)",
        },
        ink: {
          DEFAULT: "var(--color-ink)",
          soft: "var(--color-ink-soft)",
        },
        primary: {
          DEFAULT: "var(--color-primary)",
          ink: "var(--color-primary-ink)",
          hover: "var(--color-primary-hover)",
          deep: "var(--color-primary-hover)",
          soft: "var(--color-accent-aqua)",
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
        display: ["var(--font-playfair)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
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
