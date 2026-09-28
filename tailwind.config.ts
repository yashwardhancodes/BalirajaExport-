import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14201b",
        canvas: "#f4f7f5",
        line: "#e1e8e4",
        brand: {
          DEFAULT: "#0a6b4d",
          dark: "#07513a",
          deep: "#06382a", // sidebar
          soft: "#e6f2ec",
        },
        // From the Baliraja Farm Fresh medal: used sparingly for highlights.
        bronze: {
          DEFAULT: "#9a6f3c",
          light: "#e2c48f",
          soft: "#f7efe2",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Consolas", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(20, 32, 27, 0.04), 0 1px 3px rgba(20, 32, 27, 0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
