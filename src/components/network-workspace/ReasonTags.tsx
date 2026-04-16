import { cn } from "@/lib/utils";

export function ReasonTags({ tags, className }: { tags: string[]; className?: string }) {
  if (!tags.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {tags.slice(0, 4).map((t) => (
        <span
          key={t}
          className="inline-flex max-w-[11rem] truncate rounded-md border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-foreground/85"
          title={t}
        >
          {t}
        </span>
      ))}
    </div>
  );
}
