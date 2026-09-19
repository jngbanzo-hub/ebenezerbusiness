import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/config/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}"
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1rem",
        sm: "1.5rem",
        lg: "2rem",
        xl: "2.5rem",
        "2xl": "3rem"
      }
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },
        ebe: {
          night: "#06111F",
          navy: "#0B1B33",
          electric: "#1E63FF",
          cyan: "#38BDF8",
          growth: "#A3E635",
          emerald: "#22C55E",
          white: "#FFFFFF",
          mist: "#E5E7EB",
          steel: "#94A3B8",
          graphite: "#111827"
        }
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "ui-sans-serif", "system-ui"],
        display: ["var(--font-display)", "Inter", "ui-sans-serif", "system-ui"]
      },
      borderRadius: {
        xs: "0.25rem",
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "0.875rem",
        "2xl": "1rem"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(30, 99, 255, 0.22), 0 18px 60px rgba(30, 99, 255, 0.18)",
        lime: "0 0 0 1px rgba(163, 230, 53, 0.22), 0 18px 55px rgba(163, 230, 53, 0.12)",
        premium: "0 24px 80px rgba(0, 0, 0, 0.38)"
      },
      backgroundImage: {
        "ebe-radial": "radial-gradient(circle at top left, rgba(30,99,255,0.34), transparent 34%), radial-gradient(circle at 82% 22%, rgba(163,230,53,0.18), transparent 24%)",
        "ebe-panel": "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.035))",
        "ebe-electric": "linear-gradient(135deg, #1E63FF 0%, #38BDF8 52%, #A3E635 100%)",
        "ebe-night": "linear-gradient(180deg, #06111F 0%, #0B1B33 58%, #07101D 100%)"
      },
      keyframes: {
        "soft-pulse": {
          "0%, 100%": { opacity: "0.72" },
          "50%": { opacity: "1" }
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" }
        }
      },
      animation: {
        "soft-pulse": "soft-pulse 4s ease-in-out infinite",
        marquee: "marquee 30s linear infinite"
      }
    }
  },
  plugins: []
};

export default config;
