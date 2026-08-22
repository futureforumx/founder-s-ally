import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const BADGE_BASE =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium";

const VARIANT_CLASS = {
  stage: "border-blue-500/20 bg-blue-500/10 text-blue-400",
  focus: "border-primary/45 bg-primary/15 text-primary",
  geo: "border-zinc-800 bg-zinc-900 text-zinc-300",
} as const;

export type TagGroupVariant = keyof typeof VARIANT_CLASS;

export type TagGroupProps = {
  items?: readonly (string | null | undefined)[] | null;
  maxVisible?: number;
  variant?: TagGroupVariant;
  className?: string;
};

function normalizeItems(items: TagGroupProps["items"]): string[] {
  if (!items?.length) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const raw of items) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value || value === "—") continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(value);
  }
  return next;
}

function TagPill({ tag, variant }: { tag: string; variant: TagGroupVariant }) {
  return <span className={cn(BADGE_BASE, VARIANT_CLASS[variant])}>{tag}</span>;
}

export function TagGroup({ items, maxVisible = 1, variant = "geo", className }: TagGroupProps) {
  const tags = normalizeItems(items);
  if (tags.length === 0) {
    return <span className={cn("text-xs text-zinc-500", className)}>—</span>;
  }

  const visibleCount = Math.max(0, maxVisible);
  const visible = tags.slice(0, visibleCount);
  const extra = tags.slice(visibleCount);

  return (
    <div className={cn("flex h-6 min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden", className)}>
      {visible.map((tag) => (
        <TagPill key={tag} tag={tag} variant={variant} />
      ))}
      {extra.length > 0 ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`${extra.length} more: ${extra.join(", ")}`}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              className={cn(
                "inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded px-1.5 py-0.5",
                "bg-zinc-800 text-[11px] font-medium text-zinc-400 transition-colors",
                "hover:bg-zinc-700 hover:text-white data-[state=open]:bg-zinc-700 data-[state=open]:text-white",
              )}
            >
              +{extra.length}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={6}
            className="z-[9999] w-auto max-w-[16rem] border-zinc-800 bg-zinc-900 p-2 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap gap-1.5">
              {extra.map((tag) => (
                <TagPill key={tag} tag={tag} variant={variant} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
