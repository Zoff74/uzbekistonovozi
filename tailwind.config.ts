import type { Config } from "tailwindcss";
import tailwindAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class", ".dark"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        extralight: ['Extralight', 'sans-serif'],
        'playfair-italic': ['playfairdisplay-italic', 'serif'],
        'playfair-regular': ['playfairdisplay-regular', 'serif'],
        badscript: ['Bad Script', 'cursive'], 
      },
      // ДОБАВЛЯЕМ ЖЕСТКИЙ ТРЕКИНГ, ЧТОБЫ КОМПИЛЯТОР НЕ СХЛОПЫВАЛ ПРОБЕЛЫ
      letterSpacing: {
        'ultra-wide': '0.35em',
        'mega-wide': '0.5em',
      },
      keyframes: {
        'vip-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(0.96)', opacity: '0.9' },
        },
        'pulse-red-white': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'pulse-border-red': {
          '0%, 100%': { borderColor: 'rgba(220, 38, 38, 1)' },
          '50%': { borderColor: 'rgba(220, 38, 38, 0.3)' },
        },
        'pulse-border-green': {
          '0%, 100%': { borderColor: '#39FF14' },
          '50%': { borderColor: 'rgba(57, 255, 20, 0.3)' },
        }
      },
      animation: {
        'vip-pulse': 'vip-pulse 2s ease-in-out infinite',
        'pulse-red-white': 'pulse-red-white 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-subtle': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-border-red': 'pulse-border-red 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-border-green': 'pulse-border-green 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      colors: {
        neon: {
          gold: "#FFDA09",
          green: "#39FF14",
          red: "hsl(var(--neon-red-deep))",
          "red-bright": "hsl(var(--neon-red-bright))",
          blue: "#00FFFF",
          gray: "#8E8E8E",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [tailwindAnimate],
};

export default config;