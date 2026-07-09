# Vekta Design System

Source of truth for Vekta UI. Tokens live in `src/index.css` and `tailwind.config.ts`. Prefer semantic Tailwind classes (`bg-primary`, `text-muted-foreground`) over raw hex unless matching an existing marketing surface that already uses explicit values.

## 1. Visual Theme & Atmosphere

Vekta is a dark-first intelligence product: deep black shells, cool zinc neutrals, and a single electric purple accent. Marketing and access surfaces lean cinematic (full-bleed video, soft brand radial washes). The app shell is denser and quieter — sidebar rail, cards, and data tables — with purple reserved for CTAs, focus, and status heat.

**Key characteristics**
- Dark-dominant (`#000` / near-black backgrounds); light mode exists but is secondary
- Brand purple `#5B5CFF` as primary / accent; mint green `#2EE6A6` as success / secondary accent
- App body: Inter; public/marketing access surfaces: Space Grotesk
- Radius default `0.75rem` (12px); marketing cards often `rounded-2xl`
- Soft elevation via hairline + shadow tokens, not heavy multi-layer glow stacks
- Logo assets under `/public/brand/` via `BrandLogo` or direct `/brand/...` paths

## 2. Color Palette & Roles

### Brand
| Token | Hex | Role |
|-------|-----|------|
| Primary / Accent | `#5B5CFF` | CTAs, links, focus rings, heat, AI approved |
| Success / Mint | `#2EE6A6` | Success states, secondary brand wash on marketing |
| Destructive | red `hsl(0 84% 44%)` | Errors, destructive actions |
| Warning | amber `hsl(38 92% 50%)` | Warnings |

Tailwind scales: `purple-*` / `violet-*` / `indigo-*` map to brand purple; `green-*` / `emerald-*` map to brand mint (`tailwind.config.ts`).

### Dark surfaces (default)
| Role | Token / value |
|------|----------------|
| Page background | `--background` ≈ `#080808` |
| Pure black shells | `#000000` (access / marketing) |
| Card / popover | `--card` cool near-black |
| Field surface (access) | `#242424` with `border-zinc-600` |
| Borders | `--border` / `zinc-800` on marketing |
| Primary text | `--foreground` / `#eeeeee` on access |
| Secondary text | `--muted-foreground` / `#b3b3b3` on access |

### Light mode
`:root.light` flips surfaces to near-white (`hsl(210 20% 98%)`) while keeping the same purple primary. Prefer semantic tokens so both themes stay coherent.

### Do not
- Invent a second primary (no indigo/violet drift away from `#5B5CFF`)
- Default new marketing pages to cream/serif “AI brochure” looks
- Overuse glow; access mark pulse uses purple-only drop-shadows

## 3. Typography

| Role | Family | Notes |
|------|--------|--------|
| App UI | Inter (`font-sans`) | Default body; `html` root 14px |
| Public / access | Space Grotesk (`font-spaceGrotesk`) | `/access`, tryvekta marketing |
| Display alt | Clash Grotesk / Satoshi (`.font-clash`) | Selective marketing |
| Readable alt | Manrope (`.font-manrope`) | Selective |
| Code | Geist Mono (`font-mono`) | Monospace |

Scale (Tailwind): `2xs` 12px → `3xl` 32px. Weights: 400 / 500 / 600 / 700. Uppercase micro-labels use `text-2xs` + `tracking-wider` + `text-primary`.

## 4. Components & Patterns

### Buttons & CTAs
- Primary: `bg-primary text-primary-foreground`
- Quiet chrome: zinc borders on black (`border-zinc-800`)
- Prefer existing shadcn primitives in `src/components/ui/`

### Cards & forms
- App: `bg-card border-border rounded-xl` (radius from `--radius`)
- Access / marketing: `rounded-2xl border border-zinc-800 bg-black shadow-lg shadow-black/50`
- Inputs on access: dark field surface `#242424`, zinc borders, primary focus ring

### Navigation & logo
- App sidebar: `BrandLogo` with `/brand/vekta-wordmark.png` (white) or `/brand/vekta-black.svg`
- Access header mark: `/brand/vekta-access-mark.png` (32×32), optional `animate-access-mark-glow`
- Other assets: `vekta-form-header-mark.png`, `vekta-hero-wordmark.svg`, symbols, integration logos under `/brand/integration-logos/`

### Motion
- Intentional, sparse: access mark glow, subtle video scale, status pulses
- Respect `motion-reduce`
- Brand washes on video: low-opacity primary + success radials (see `AccessRequest.tsx`)

## 5. Layout Principles

- App: sidebar + top nav shell; content density over marketing whitespace
- Public pages: no app chrome; one composition per viewport; brand mark visible early
- Prefer full-bleed media on promotional surfaces; avoid card-in-hero patterns unless interaction requires a container

## 6. Implementation Checklist

1. Read tokens in `src/index.css` before adding colors
2. Use `bg-primary` / `text-primary` / `border-border` / `text-muted-foreground` first
3. Match nearby surfaces (app vs `/access` vs tryvekta) rather than mixing fonts/palettes
4. Reuse `BrandLogo` or existing `/brand/` files — do not hotlink third-party logo CDNs when a local asset exists
5. Keep purple = `#5B5CFF` and mint = `#2EE6A6` when hardcoding is unavoidable
