import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f6f7f9",
          100: "#eceef2",
          200: "#d5d9e2",
          300: "#b6bcca",
          400: "#8a93a6",
          500: "#656d80",
          600: "#4a5163",
          700: "#343a4a",
          800: "#1f2433",
          900: "#0f1320",
        },
        brand: {
          50: "#eef4ff",
          100: "#dde9ff",
          200: "#b9cfff",
          500: "#3b6ef5",
          600: "#2853d8",
          700: "#1f43b0",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Inter",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "Noto Sans SC",
          "Source Han Sans SC",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
