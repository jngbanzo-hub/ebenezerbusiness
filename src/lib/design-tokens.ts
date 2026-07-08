export const designTokens = {
  colors: {
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
  },
  typography: {
    fontSans: "Inter, SF Pro Display, Segoe UI, system-ui, sans-serif",
    fontDisplay: "Inter, SF Pro Display, Segoe UI, system-ui, sans-serif",
    scale: {
      eyebrow: "0.75rem",
      body: "1rem",
      lead: "1.125rem",
      h3: "1.5rem",
      h2: "2.25rem",
      h1: "clamp(2.5rem, 5vw, 5.25rem)"
    }
  },
  spacing: {
    section: "clamp(4rem, 8vw, 7rem)",
    container: "min(1120px, calc(100vw - 2rem))",
    card: "1.25rem"
  },
  radii: {
    sm: "0.5rem",
    md: "0.75rem",
    lg: "1rem",
    xl: "1.25rem"
  },
  shadows: {
    premium: "0 24px 80px rgba(0, 0, 0, 0.38)",
    glow: "0 0 0 1px rgba(30, 99, 255, 0.22), 0 18px 60px rgba(30, 99, 255, 0.18)",
    growth: "0 0 0 1px rgba(163, 230, 53, 0.22), 0 18px 55px rgba(163, 230, 53, 0.12)"
  },
  gradients: {
    electric: "linear-gradient(135deg, #1E63FF 0%, #38BDF8 52%, #A3E635 100%)",
    night: "linear-gradient(180deg, #06111F 0%, #0B1B33 58%, #07101D 100%)",
    panel: "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.035))"
  }
} as const;

export type DesignTokens = typeof designTokens;
