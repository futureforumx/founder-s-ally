import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const MENU =
  "min-w-[12.5rem] rounded-lg border border-zinc-700/90 bg-zinc-950 py-1 text-zinc-100 shadow-xl";

const ITEM = cn(
  "cursor-pointer rounded-none px-3 py-2 text-[13px] font-normal leading-snug text-zinc-200",
  "focus:bg-white/[0.06] focus:text-zinc-50 data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-zinc-50",
);

const TRIGGER = cn(
  "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-[#eeeeee]/80 outline-none ring-offset-black transition-colors",
  "hover:bg-white/[0.06] hover:text-[#eeeeee] focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
  "data-[state=open]:bg-white/[0.06] data-[state=open]:text-[#eeeeee]",
);

export function PublicIntelMoreResources({ triggerLabel = "More resources" }: { triggerLabel?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger type="button" className={TRIGGER}>
        <span>{triggerLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className={MENU}>
        <DropdownMenuItem asChild className={ITEM}>
          <Link to="/fresh-capital">Fund Watch</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ITEM}>
          <Link to="/fresh-capital?tab=latest_funding">Recent funding</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ITEM}>
          <Link to="/trending-companies">Trending companies</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ITEM}>
          <Link to="/trending-startups">Trending startups</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ITEM}>
          <a href="/tools/ai-agents">Agent Library</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
