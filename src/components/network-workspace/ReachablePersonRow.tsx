import { Button } from "@/components/ui/button";
import { PathPreview } from "./PathPreview";
import { ReasonTags } from "./ReasonTags";
import type { ReachablePerson } from "./types";
import { cn } from "@/lib/utils";

const hopLabel: Record<ReachablePerson["hop"], string> = {
  direct: "Direct",
  "2-hop": "2-hop",
  "3-hop": "3-hop",
};

const categoryLabel: Record<ReachablePerson["category"], string> = {
  investor: "Investor",
  founder: "Founder",
  operator: "Operator",
  customer: "Customer",
  advisor: "Advisor",
  other: "Other",
};

export function ReachablePersonRow({
  person,
  onViewPath,
}: {
  person: ReachablePerson;
  onViewPath: (p: ReachablePerson) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onViewPath(person)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onViewPath(person);
        }
      }}
      className={cn(
        "flex cursor-pointer flex-col gap-3 rounded-2xl border border-border/50 bg-card/60 px-4 py-3.5",
        "sm:flex-row sm:items-start sm:justify-between",
        "transition-[box-shadow,transform] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
      )}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="truncate text-sm font-semibold text-foreground">{person.fullName}</p>
          <span className="text-[11px] text-muted-foreground">
            {person.role}
            {person.firmName ? ` · ${person.firmName}` : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="rounded-md bg-secondary/60 px-1.5 py-0.5 text-foreground/80">{categoryLabel[person.category]}</span>
          <span className="rounded-md border border-border/60 px-1.5 py-0.5">{hopLabel[person.hop]}</span>
          <span className="tabular-nums text-foreground/70">Path {Math.round(person.bestPath.score)}</span>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/90">Best path</p>
          <PathPreview path={person.bestPath} className="mt-1" />
        </div>
        <ReasonTags tags={person.bestPath.reasonTags} />
      </div>
      <div className="flex shrink-0 items-center sm:flex-col sm:items-end sm:gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="h-8 rounded-lg text-xs font-semibold"
          onClick={(e) => {
            e.stopPropagation();
            onViewPath(person);
          }}
        >
          View Path
        </Button>
      </div>
    </div>
  );
}
