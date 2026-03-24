import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ArrowRight, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SyncField {
  key: string;
  label: string;
  existing: string | null;
  incoming: string | null;
}

interface SyncReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: SyncField[];
  onApply: (selectedKeys: string[]) => void;
  applying?: boolean;
}

export function SyncReviewModal({ open, onOpenChange, title, fields, onApply, applying }: SyncReviewModalProps) {
  // Only show fields where incoming is different from existing
  const changedFields = fields.filter(f => f.incoming && f.incoming !== f.existing);
  const [selected, setSelected] = useState<Set<string>>(new Set(changedFields.map(f => f.key)));

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleApply = () => {
    onApply(Array.from(selected));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-accent" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Review the enriched data below. Toggle fields to include or exclude, then apply.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto space-y-1 py-2">
          {changedFields.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No new data found — your profile is already up to date.
            </div>
          ) : (
            changedFields.map((field, i) => {
              const isSelected = selected.has(field.key);
              return (
                <motion.button
                  key={field.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => toggle(field.key)}
                  className={cn(
                    "w-full text-left rounded-xl border p-3 transition-all",
                    isSelected
                      ? "border-accent/40 bg-accent/5"
                      : "border-border/50 bg-muted/20 opacity-60"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">{field.label}</p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground line-through truncate max-w-[140px]">
                          {field.existing || "Empty"}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                        <span className="text-foreground font-medium truncate max-w-[180px]">
                          {field.incoming && field.incoming !== "null" ? field.incoming : "No results"}
                        </span>
                      </div>
                    </div>
                    <div className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full border-2 shrink-0 mt-1 transition-colors",
                      isSelected ? "border-accent bg-accent" : "border-border"
                    )}>
                      {isSelected && <CheckCircle2 className="h-3 w-3 text-accent-foreground" />}
                    </div>
                  </div>
                </motion.button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="rounded-lg text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={selected.size === 0 || applying}
            className="rounded-lg text-xs font-semibold"
          >
            {applying ? "Applying..." : `Apply ${selected.size} Change${selected.size !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
