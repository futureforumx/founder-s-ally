import { AISuggestionIcon } from "./AISuggestionIcon";
import { Badge } from "@/components/ui/badge";

interface ProfileFieldProps {
  label: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  isAiDraft?: boolean;
  aiSuggestion?: string | null;
  onApplySuggestion?: () => void;
}

export function ProfileField({ label, icon, children, isAiDraft, aiSuggestion, onApplySuggestion }: ProfileFieldProps) {
  const showSuggestion = aiSuggestion && onApplySuggestion;

  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
        {isAiDraft && (
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-1 bg-accent/10 text-accent border-accent/20">
            AI
          </Badge>
        )}
        {showSuggestion && (
          <AISuggestionIcon aiValue={aiSuggestion!} onApply={onApplySuggestion!} />
        )}
      </label>
      {children}
    </div>
  );
}
