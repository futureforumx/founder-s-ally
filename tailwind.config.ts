import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["Geist Mono", "SF Mono", "Fira Code", "monospace"],
      },
      fontSize: {
        "2xs": ["0.75rem", { lineHeight: "1rem", fontWeight: "500" }],      /* 12px */
        "xs": ["0.8125rem", { lineHeight: "1.125rem", fontWeight: "400" }],  /* 13px */
        "sm": ["0.875rem", { lineHeight: "1.25rem", fontWeight: "400" }],    /* 14px */
        "md": ["1rem", { lineHeight: "1.5rem", fontWeight: "400" }],         /* 16px */
        "lg": ["1.125rem", { lineHeight: "1.625rem", fontWeight: "500" }],   /* 18px */
        "xl": ["1.25rem", { lineHeight: "1.75rem", fontWeight: "600" }],     /* 20px */
        "2xl": ["1.5rem", { lineHeight: "2rem", fontWeight: "700" }],        /* 24px */
        "3xl": ["2rem", { lineHeight: "2.5rem", fontWeight: "700" }],        /* 32px */
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        heat: {
          0: "hsl(var(--heat-0))",
          1: "hsl(var(--heat-1))",
          2: "hsl(var(--heat-2))",
          3: "hsl(var(--heat-3))",
          4: "hsl(var(--heat-4))",
        },
        "ai-pending": {
          DEFAULT: "hsl(var(--ai-pending))",
          foreground: "hsl(var(--ai-pending-foreground))",
        },
        "ai-approved": {
          DEFAULT: "hsl(var(--ai-approved))",
          foreground: "hsl(var(--ai-approved-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "surface": "var(--shadow-sm)",
        "surface-md": "var(--shadow-md)",
        "surface-lg": "var(--shadow-lg)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "radar-spin": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "radar-ping": {
          "0%": { transform: "scale(0.5)", opacity: "0.8" },
          "100%": { transform: "scale(2.5)", opacity: "0" },
        },
        "spring-pop": {
          "0%": { transform: "scale(0.3) translateY(20px)", opacity: "0" },
          "50%": { transform: "scale(1.08) translateY(-4px)", opacity: "1" },
          "70%": { transform: "scale(0.96) translateY(1px)" },
          "100%": { transform: "scale(1) translateY(0)" },
        },
        "funding-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "swipe-out-left": {
          "0%": { transform: "translateX(0) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translateX(-120%) rotate(-8deg)", opacity: "0" },
        },
        "swipe-out-right": {
          "0%": { transform: "translateX(0) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translateX(120%) rotate(8deg)", opacity: "0" },
        },
        "slide-in-from-right": {
          "0%": { transform: "translateX(40px) scale(0.95)", opacity: "0" },
          "100%": { transform: "translateX(0) scale(1)", opacity: "1" },
        },
        "drop-in": {
          "0%": { transform: "translateY(-10px) scale(0.97)", opacity: "0" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "15%": { transform: "translateX(-4px)" },
          "30%": { transform: "translateX(4px)" },
          "45%": { transform: "translateX(-3px)" },
          "60%": { transform: "translateX(3px)" },
          "75%": { transform: "translateX(-2px)" },
          "90%": { transform: "translateX(2px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "radar-spin": "radar-spin 3s linear infinite",
        "radar-ping": "radar-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite",
        "spring-pop": "spring-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "funding-pulse": "funding-pulse 2s ease-in-out infinite",
        "swipe-out-left": "swipe-out-left 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards",
        "swipe-out-right": "swipe-out-right 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards",
        "slide-in-from-right": "slide-in-from-right 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "drop-in": "drop-in 0.3s ease-out forwards",
        "shake": "shake 0.4s ease-in-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
