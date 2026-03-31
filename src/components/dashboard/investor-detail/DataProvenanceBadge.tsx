import { CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface DataProvenanceBadgeProps {
  dataSource: "verified" | "live";
  lastSynced?: Date | null;
  emailAddress?: string | null;
  investmentClassification?: string | null;
  stageRange?: string | null;
  showDetails?: boolean;
}

export function DataProvenanceBadge({
  dataSource,
  lastSynced,
  emailAddress,
  investmentClassification,
  stageRange,
  showDetails = true,
}: DataProvenanceBadgeProps) {
  if (dataSource === "verified") {
    return (
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-accent">
        <CheckCircle2 className="h-3 w-3 text-accent" />
        Verified by Outbuild
      </div>
    );
  }

  const timeAgo = lastSynced
    ? formatDistanceToNow(lastSynced, { addSuffix: false })
    : "recently";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-success">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        Live Synced: {timeAgo} ago
      </div>
      {showDetails && (
        <div className="grid grid-cols-1 gap-0.5 text-[10px] text-muted-foreground/90">
          <div>
            <span className="font-medium text-foreground/75">Email:</span>{" "}
            {emailAddress || "-"}
          </div>
          <div>
            <span className="font-medium text-foreground/75">Investment Classification:</span>{" "}
            {investmentClassification || "-"}
          </div>
          <div>
            <span className="font-medium text-foreground/75">Stage Range:</span>{" "}
            {stageRange || "-"}
          </div>
        </div>
      )}
    </div>
  );
}
