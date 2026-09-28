import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0b0d10",
          raised: "#14171c",
          overlay: "#1c2027",
        },
        border: {
          DEFAULT: "#2a2f38",
        },
      },
    },
  },
  plugins: [],
};
export default config;
