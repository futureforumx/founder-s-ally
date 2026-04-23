import { cva, type VariantProps } from "class-variance-authority";

export const premiumTableBadgeClasses = {
  badge:
    "inline-flex max-w-fit items-center whitespace-nowrap border align-middle shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors duration-150",
  "badge--round":
    "h-5 min-w-0 rounded-[10px] px-2 text-[11px] font-semibold tracking-[0.01em]",
  "badge--sector":
    "h-5 min-w-0 rounded-[9px] px-2 text-[10px] font-medium tracking-[0.015em]",
  "badge--neutral":
    "h-5 min-w-0 rounded-[9px] px-2 text-[10px] font-medium tracking-[0.01em]",
} as const;

export const premiumTableBadgeVariants = cva(premiumTableBadgeClasses.badge, {
  variants: {
    kind: {
      round: premiumTableBadgeClasses["badge--round"],
      sector: premiumTableBadgeClasses["badge--sector"],
      neutral: premiumTableBadgeClasses["badge--neutral"],
    },
    tone: {
      default: "",
      strategic: "",
      series: "",
      ai: "",
      graphite: "",
    },
  },
  compoundVariants: [
    {
      kind: "round",
      tone: "default",
      className:
        "border-white/12 bg-white/[0.025] text-zinc-100/90 hover:border-white/16 hover:bg-white/[0.04]",
    },
    {
      kind: "round",
      tone: "strategic",
      className:
        "border-cyan-200/14 bg-cyan-300/[0.04] text-cyan-50/90 hover:border-cyan-200/18 hover:bg-cyan-300/[0.06]",
    },
    {
      kind: "round",
      tone: "series",
      className:
        "border-blue-200/14 bg-blue-300/[0.04] text-blue-50/90 hover:border-blue-200/18 hover:bg-blue-300/[0.06]",
    },
    {
      kind: "sector",
      tone: "default",
      className:
        "border-white/8 bg-white/[0.035] text-zinc-300/88 hover:border-white/10 hover:bg-white/[0.05]",
    },
    {
      kind: "sector",
      tone: "ai",
      className:
        "border-indigo-200/10 bg-indigo-300/[0.10] text-indigo-50/88 hover:border-indigo-200/14 hover:bg-indigo-300/[0.13]",
    },
    {
      kind: "sector",
      tone: "graphite",
      className:
        "border-white/7 bg-zinc-400/[0.06] text-zinc-400 hover:border-white/9 hover:bg-zinc-400/[0.09]",
    },
    {
      kind: "neutral",
      tone: "graphite",
      className:
        "border-white/7 bg-zinc-400/[0.06] text-zinc-400 hover:border-white/9 hover:bg-zinc-400/[0.09]",
    },
  ],
  defaultVariants: {
    kind: "sector",
    tone: "default",
  },
});

export type PremiumTableBadgeKind = NonNullable<VariantProps<typeof premiumTableBadgeVariants>["kind"]>;
export type PremiumTableBadgeTone = NonNullable<VariantProps<typeof premiumTableBadgeVariants>["tone"]>;

export function getPremiumTableBadgeTone(kind: PremiumTableBadgeKind, label: string): PremiumTableBadgeTone {
  const normalized = label.trim().toLowerCase();

  if (!normalized || normalized === "unknown" || normalized === "n/a" || normalized === "other") {
    return "graphite";
  }

  if (kind === "round") {
    if (normalized.includes("strategic")) return "strategic";
    if (/series\s+[a-z]/.test(normalized)) return "series";
    return "default";
  }

  if (kind === "sector" && (normalized === "ai" || normalized.includes("artificial intelligence"))) {
    return "ai";
  }

  return "default";
}
