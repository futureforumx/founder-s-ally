import { useMemo } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import type { CapBacker } from "./CapTableRow";

interface CapTableFooterProps {
  backers: CapBacker[];
  onSave?: () => void;
}

export function CapTableFooter({ backers, onSave }: CapTableFooterProps) {
  const totalAllocated = useMemo(
    () => backers.reduce((sum, b) => sum + (b.ownershipPct || 0), 0),
    [backers]
  );

  const remainingEquity = 100 - totalAllocated;
  const isExact = Math.abs(totalAllocated - 100) < 0.001;
  const isOver = totalAllocated > 100;
  const isUnder = totalAllocated < 100 && totalAllocated > 0;
  const isEmpty = totalAllocated === 0;

  return (
    <div className="space-y-3 mt-2">
      {/* Sticky summary footer */}
      <div
        className="flex items-center justify-between rounded-2xl px-5 py-3.5"
        style={{
          background: isOver
            ? "hsla(0, 80%, 96%, 1)"
            : isExact
            ? "hsla(152, 60%, 96%, 1)"
            : "hsl(var(--secondary))",
          border: `1px solid ${
            isOver
              ? "hsla(0, 70%, 85%, 1)"
              : isExact
              ? "hsla(152, 50%, 80%, 1)"
              : "hsla(var(--border), 0.5)"
          }`,
        }}
      >
        <span className="text-sm font-semibold text-foreground">Total Allocated</span>

        <div className="flex items-center gap-2.5">
          {isExact && (
            <CheckCircle2 className="h-4 w-4" style={{ color: "hsl(152, 60%, 40%)" }} />
          )}
          {isOver && (
            <AlertTriangle className="h-4 w-4" style={{ color: "hsl(0, 70%, 50%)" }} />
          )}

          <span
            className="text-base font-bold"
            style={{
              fontFamily: "'Geist Mono', monospace",
              color: isOver
                ? "hsl(0, 70%, 50%)"
                : isExact
                ? "hsl(152, 60%, 40%)"
                : "hsl(var(--foreground))",
            }}
          >
            {totalAllocated.toFixed(2)}%
          </span>

          {isUnder && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{
                background: "hsla(var(--secondary), 0.8)",
                color: "hsl(var(--muted-foreground))",
              }}
            >
              Remaining: {remainingEquity.toFixed(2)}%
            </span>
          )}

          {isOver && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{
                background: "hsla(0, 80%, 92%, 1)",
                color: "hsl(0, 70%, 50%)",
              }}
            >
              Over-allocated by {Math.abs(remainingEquity).toFixed(2)}% 🛑
            </span>
          )}

          {isEmpty && (
            <span className="text-xs text-muted-foreground">No equity assigned</span>
          )}
        </div>
      </div>

      {/* Save button with validation gate */}
      {onSave && (
        <div className="flex justify-end">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    onClick={onSave}
                    disabled={isOver}
                    className="rounded-xl h-10 px-6 text-sm font-semibold"
                    style={{
                      background: isOver ? "hsl(var(--muted))" : "hsl(var(--primary))",
                      color: isOver ? "hsl(var(--muted-foreground))" : "hsl(var(--primary-foreground))",
                    }}
                  >
                    Save Cap Table
                  </Button>
                </span>
              </TooltipTrigger>
              {isOver && (
                <TooltipContent side="top">
                  <p className="text-xs">Total ownership cannot exceed 100%</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
}
