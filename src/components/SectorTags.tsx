import { useState, useEffect, useRef } from "react";
import { X, Plus, Sparkles, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export interface SectorClassification {
  primary_sector: string;
  modern_tags: string[];
}

interface SectorTagsProps {
  websiteText?: string;
  executiveSummary?: string;
  companyName?: string;
  onChange?: (classification: SectorClassification) => void;
}

export function SectorTags({ websiteText, executiveSummary, companyName, onChange }: SectorTagsProps) {
  const [classification, setClassification] = useState<SectorClassification | null>(() => {
    try {
      const saved = localStorage.getItem("company-sector-tags");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [isClassifying, setIsClassifying] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newTag, setNewTag] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist to localStorage
  useEffect(() => {
    if (classification) {
      localStorage.setItem("company-sector-tags", JSON.stringify(classification));
      onChange?.(classification);
    }
  }, [classification, onChange]);

  // Notify parent on mount
  useEffect(() => {
    if (classification) onChange?.(classification);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const classify = async () => {
    if (!websiteText && !executiveSummary) return;
    setIsClassifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("classify-sector", {
        body: { websiteText, executiveSummary, companyName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setClassification(data as SectorClassification);
    } catch (e) {
      console.error("Classification failed:", e);
    } finally {
      setIsClassifying(false);
    }
  };

  const removeTag = (tag: string) => {
    if (!classification) return;
    setClassification({
      ...classification,
      modern_tags: classification.modern_tags.filter(t => t !== tag),
    });
  };

  const addTag = () => {
    const trimmed = newTag.trim();
    if (!trimmed || !classification) return;
    if (classification.modern_tags.includes(trimmed)) { setNewTag(""); return; }
    setClassification({
      ...classification,
      modern_tags: [...classification.modern_tags, trimmed],
    });
    setNewTag("");
    setIsAdding(false);
  };

  const hasContent = !!(websiteText || executiveSummary);

  // Nothing classified yet — show classify button
  if (!classification) {
    return (
      <div className="space-y-1.5">
        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> AI Sector Tags
        </label>
        <button
          onClick={classify}
          disabled={!hasContent || isClassifying}
          className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isClassifying ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Classifying…</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5" /> Auto-classify sector from your data</>
          )}
        </button>
        {!hasContent && (
          <p className="text-[10px] text-muted-foreground">Run analysis first to enable AI classification</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> AI Sector Classification
        </label>
        <button
          onClick={classify}
          disabled={!hasContent || isClassifying}
          className="text-[10px] text-accent hover:underline disabled:opacity-40 flex items-center gap-1"
        >
          {isClassifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          Re-classify
        </button>
      </div>

      {/* Primary Sector Badge */}
      <div>
        <Badge variant="accent">
          {classification.primary_sector}
        </Badge>
      </div>

      {/* Modern Tags */}
      <div className="flex flex-wrap items-center gap-1.5">
        {classification.modern_tags.map(tag => (
          <Badge
            key={tag}
            variant="secondary-sm"
            className="gap-1 pr-1 group cursor-default"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="ml-0.5 rounded-full p-0.5 opacity-50 hover:opacity-100 hover:bg-destructive/20 transition-opacity"
              title="Remove tag"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}

        {isAdding ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTag();
                if (e.key === "Escape") { setIsAdding(false); setNewTag(""); }
              }}
              onBlur={() => { if (!newTag.trim()) setIsAdding(false); }}
              placeholder="e.g. Vertical AI"
              className="h-6 w-28 rounded border border-input bg-background px-2 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring/30"
              autoFocus
            />
          </div>
        ) : (
          <button
            onClick={() => { setIsAdding(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            className="flex items-center gap-0.5 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:border-accent/40 hover:text-foreground transition-colors"
          >
            <Plus className="h-3 w-3" /> Add tag
          </button>
        )}
      </div>
    </div>
  );
}
