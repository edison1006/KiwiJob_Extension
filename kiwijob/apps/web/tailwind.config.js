/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f3ff",
          100: "#ede9fe",
          300: "#c4b5fd",
          500: "#8b5cf6",
          600: "#6d3fc3",
          700: "#552c9f",
          900: "#2b145c",
        },
      },
      keyframes: {
        "premium-gradient": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
    },
  },
  plugins: [],
};
