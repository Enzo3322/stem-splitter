/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        stem: {
          vocals: "#ec4899",
          drums: "#f59e0b",
          bass: "#8b5cf6",
          guitar: "#10b981",
          piano: "#3b82f6",
          other: "#6b7280",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
