import type { Config } from "tailwindcss"
import colors from "tailwindcss/colors"
import animate from "tailwindcss-animate"

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        gray: {
          ...colors.neutral,
        },
      },
      transitionDuration: {
        "1200": "1200ms",
        "1500": "1500ms",
      },
      keyframes: {
        shimmer: {
          "0%": {
            transform: "translateX(-100%)",
          },
          "100%": {
            transform: "translateX(100%)",
          },
        },
      },
      animation: {
        shimmer: "shimmer 2s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
}

export default config
