import { cn } from "@/lib/utils";

/**
 * Extract 1–10 overall score from `vc_ratings.star_ratings` (unlinked review form Q1).
 */
export function parseOverallTenFromStarRatings(starRatings: unknown): number | null {
  if (!starRatings || typeof starRatings !== "object") return null;
  const answers = (starRatings as { answers?: unknown }).answers;
  if (!answers || typeof answers !== "object") return null;
  const raw = (answers as Record<string, unknown>).overall_interaction;
  if (typeof raw !== "string") return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 10 || String(n) !== raw) return null;
  return n;
}

/**
 * Linked review: "How has this investor been to work with?"
 */
export function parseWorkWithThemFromStarRatings(starRatings: unknown): string | null {
  if (!starRatings || typeof starRatings !== "object") return null;
  const answers = (starRatings as { answers?: unknown }).answers;
  if (!answers || typeof answers !== "object") return null;
  const raw = (answers as Record<string, unknown>).work_with_them_rating;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

/**
 * Button chrome aligned with `scoreMeaningPanelClass` buckets in ReviewWizardParts (1–10 scale).
 */
export function overallTenRateButtonClass(n: number): string {
  if (n <= 2) {
    return cn(
      "border-2 border-red-200/70 bg-red-50/95 text-red-950 hover:bg-red-50",
      "dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-50 dark:hover:bg-red-950/55",
    );
  }
  if (n <= 4) {
    return cn(
      "border-2 border-orange-200/70 bg-orange-50/95 text-orange-950 hover:bg-orange-50",
      "dark:border-orange-800/50 dark:bg-orange-950/40 dark:text-orange-50 dark:hover:bg-orange-950/55",
    );
  }
  if (n <= 6) {
    return cn(
      "border-2 border-amber-200/70 bg-amber-50/95 text-amber-950 hover:bg-amber-50",
      "dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-50 dark:hover:bg-amber-950/55",
    );
  }
  if (n <= 8) {
    return cn(
      "border-2 border-lime-200/60 bg-lime-50/95 text-lime-950 hover:bg-lime-50",
      "dark:border-lime-800/45 dark:bg-lime-950/35 dark:text-lime-50 dark:hover:bg-lime-950/50",
    );
  }
  return cn(
    "border-2 border-emerald-200/70 bg-emerald-50/95 text-emerald-950 hover:bg-emerald-50",
    "dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-50 dark:hover:bg-emerald-950/55",
  );
}

/** Linked categorical work-with rating (review form Q1). */
export function linkedWorkRatingButtonClass(label: string): string {
  switch (label) {
    case "Great":
      return cn(
        "border-2 border-emerald-200/70 bg-emerald-50/95 text-emerald-950 hover:bg-emerald-50",
        "dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-50 dark:hover:bg-emerald-950/55",
      );
    case "Good":
      return cn(
        "border-2 border-lime-200/60 bg-lime-50/95 text-lime-950 hover:bg-lime-50",
        "dark:border-lime-800/45 dark:bg-lime-950/35 dark:text-lime-50 dark:hover:bg-lime-950/50",
      );
    case "Mixed":
      return cn(
        "border-2 border-amber-200/70 bg-amber-50/95 text-amber-950 hover:bg-amber-50",
        "dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-50 dark:hover:bg-amber-950/55",
      );
    case "Poor":
      return cn(
        "border-2 border-red-200/70 bg-red-50/95 text-red-950 hover:bg-red-50",
        "dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-50 dark:hover:bg-red-950/55",
      );
    default:
      return cn(
        "border-2 border-warning/30 bg-warning/10 text-warning hover:bg-warning/15",
        "dark:border-warning/40 dark:bg-warning/15 dark:text-warning",
      );
  }
}

export type MyReviewRateButtonDisplay = {
  label: string;
  className: string;
  /** Text-only color class for the star + number (no bg or border). */
  colorClass: string;
  /** Short tier label for aria (e.g. "Strong") */
  ariaDetail: string;
};

export function overallTenRateColorClass(n: number): string {
  if (n <= 2) return "text-red-600 dark:text-red-400";
  if (n <= 4) return "text-orange-600 dark:text-orange-400";
  if (n <= 6) return "text-amber-600 dark:text-amber-400";
  if (n <= 8) return "text-lime-600 dark:text-lime-500";
  return "text-emerald-600 dark:text-emerald-400";
}

export function linkedWorkRatingColorClass(label: string): string {
  switch (label) {
    case "Great": return "text-emerald-600 dark:text-emerald-400";
    case "Good":  return "text-lime-600 dark:text-lime-500";
    case "Mixed": return "text-amber-600 dark:text-amber-400";
    case "Poor":  return "text-red-600 dark:text-red-400";
    default:      return "text-warning dark:text-warning";
  }
}

const OVERALL_TIER_ARIA: Record<number, string> = {
  10: "Exceptional",
  9: "Great",
  8: "Strong",
  7: "Good",
  6: "Mixed",
  5: "Mixed",
  4: "Weak",
  3: "Poor",
  2: "Rough",
  1: "Toxic or terrible",
};

/** Build label + styles for the header "Rate" control after the user has submitted. */
export function formatMyReviewRateButton(starRatings: unknown): MyReviewRateButtonDisplay | null {
  const ten = parseOverallTenFromStarRatings(starRatings);
  if (ten != null) {
    return {
      label: `${ten}`,
      className: overallTenRateButtonClass(ten),
      colorClass: overallTenRateColorClass(ten),
      ariaDetail: OVERALL_TIER_ARIA[ten] ?? "Rated",
    };
  }
  const linked = parseWorkWithThemFromStarRatings(starRatings);
  if (linked) {
    return {
      label: linked,
      className: linkedWorkRatingButtonClass(linked),
      colorClass: linkedWorkRatingColorClass(linked),
      ariaDetail: linked,
    };
  }
  return null;
}
