/** Tema AstroTune: tokens en variables CSS (oscuro por defecto, claro opcional). */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fg: "rgb(var(--fg) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        bg: "rgb(var(--bg) / <alpha-value>)",
        glass: "rgb(var(--glass) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        accent2: "rgb(var(--accent2) / <alpha-value>)",
        ok: "rgb(var(--ok) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        bad: "rgb(var(--bad) / <alpha-value>)",
      },
      fontFamily: { sans: ["Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"], mono: ["JetBrains Mono", "ui-monospace", "Menlo", "monospace"] },
      boxShadow: { glass: "0 18px 50px -12px rgb(0 0 0 / .45), inset 0 1px 0 rgb(255 255 255 / .18)" },
      borderRadius: { "4xl": "2rem" },
      keyframes: { rise: { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "none" } } },
      animation: { rise: "rise .35s cubic-bezier(.2,.8,.2,1) both" },
    },
  },
  plugins: [],
};
