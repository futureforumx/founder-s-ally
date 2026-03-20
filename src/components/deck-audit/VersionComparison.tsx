import { useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { VersionDelta } from "./types";

interface VersionComparisonProps {
  compareMode: boolean;
  onToggleCompare: (val: boolean) => void;
  delta: VersionDelta;
}

export function VersionComparison({ compareMode, onToggleCompare, delta }: VersionComparisonProps) {
  return (
    <div className="space-y-6">
      {/* Toggle */}
      <div className="flex items-center gap-3">
        <span className={cn("text-xs font-semibold", !compareMode ? "text-foreground" : "text-muted-foreground")}>Current Version</span>
        <Switch checked={compareMode} onCheckedChange={onToggleCompare} />
        <span className={cn("text-xs font-semibold", compareMode ? "text-foreground" : "text-muted-foreground")}>Compare to Previous</span>
      </div>

      {compareMode && (
        <div className="space-y-6">
          {/* Improvements */}
          {delta.improvements.length > 0 && (
            <div className="rounded-xl border border-success/20 bg-success/5 p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <ArrowUp className="h-3.5 w-3.5 text-success" />
                <span className="text-xs font-semibold text-foreground">Improvements</span>
              </div>
              <ul className="space-y-2">
                {delta.improvements.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Regressions */}
          {delta.regressions.length > 0 && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <ArrowDown className="h-3.5 w-3.5 text-destructive" />
                <span className="text-xs font-semibold text-foreground">Regressions</span>
              </div>
              <ul className="space-y-2">
                {delta.regressions.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-destructive" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {delta.improvements.length === 0 && delta.regressions.length === 0 && (
            <div className="rounded-xl border border-border bg-muted/20 p-6 text-center">
              <p className="text-xs text-muted-foreground">No previous version to compare against.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
