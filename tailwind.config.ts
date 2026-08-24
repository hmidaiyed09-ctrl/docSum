import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0b0b16",
        panel: "#12121f",
        card: "#181828",
        accent: "#7c6ff0",
        "accent-deep": "#5b4bd6",
      },
    },
  },
  plugins: [],
};
export default config;
