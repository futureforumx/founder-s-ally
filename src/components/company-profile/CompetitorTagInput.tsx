import { useState, useRef } from "react";
import { X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CompetitorTagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  isAiDraft?: boolean;
}

export function CompetitorTagInput({ tags, onChange, isAiDraft }: CompetitorTagInputProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const t = value.trim();
    if (!t || tags.includes(t)) { setValue(""); return; }
    onChange([...tags, t]);
    setValue("");
    setIsAdding(false);
  };

  return (
    <div className={`flex flex-wrap items-center gap-1.5 rounded-lg border border-input px-3 py-2 min-h-[38px] transition-colors ${isAiDraft ? "bg-accent/5 border-accent/20" : "bg-background"}`}>
      {tags.map(tag => (
        <Badge key={tag} variant="secondary" className="text-[11px] font-normal gap-1 pr-1">
          {tag}
          <button onClick={() => onChange(tags.filter(t => t !== tag))}
            className="ml-0.5 rounded-full p-0.5 opacity-50 hover:opacity-100 hover:bg-destructive/20 transition-opacity">
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ))}
      {isAdding ? (
        <input ref={inputRef} value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") add(); if (e.key === "Escape") { setIsAdding(false); setValue(""); } }}
          onBlur={() => { if (!value.trim()) setIsAdding(false); }}
          placeholder="e.g. Stripe"
          className="h-6 w-24 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          autoFocus />
      ) : (
        <button onClick={() => { setIsAdding(true); setTimeout(() => inputRef.current?.focus(), 50); }}
          className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
          <Plus className="h-3 w-3" /> Add
        </button>
      )}
    </div>
  );
}
