import { cn } from "@/lib/utils";

/** Outline share buttons on dark waitlist cards — overrides theme `outline` bg/hover that clash with #121212. */
export const referralShareOutlineButtonClass = cn(
  "border-zinc-500 bg-zinc-950 text-zinc-100 shadow-none",
  "hover:bg-zinc-800 hover:text-white",
  "active:bg-zinc-900",
  "focus-visible:border-zinc-400 focus-visible:ring-zinc-500",
);
