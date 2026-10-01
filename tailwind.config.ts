import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#262624",
          raised: "#2d2c2a",
          overlay: "#37352f",
        },
        border: {
          DEFAULT: "#46443e",
        },
        accent: {
          300: "#e4a98d",
          400: "#d88e68",
          500: "#cc785c",
          600: "#b5634a",
          700: "#9c5340",
          800: "#7a4132",
        },
      },
    },
  },
  plugins: [],
};
export default config;
