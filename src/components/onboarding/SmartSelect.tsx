import { useState, useEffect, useRef } from "react";
import { PredictiveBadge } from "./PredictiveBadge";

/** Text color for AI-suggested values until the user edits the field */
export const AI_SUGGESTED_TEXT_CLASS = "text-[#6C44FC]";

interface SmartSelectProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  predictedValue?: string;
  /** When true, value is shown in AI suggestion color (controlled by parent) */
  highlightAi?: boolean;
  /** Called once when this component auto-fills from predictedValue */
  onAiAutofill?: () => void;
  /** Called when the user changes the select (not when auto-filled) */
  onUserEdited?: () => void;
}

export function SmartSelect({
  label,
  value,
  onChange,
  options,
  predictedValue,
  highlightAi = false,
  onAiAutofill,
  onUserEdited,
}: SmartSelectProps) {
  const [isPredicted, setIsPredicted] = useState(false);
  const autofillFired = useRef(false);

  useEffect(() => {
    if (predictedValue && !value) {
      onChange(predictedValue);
      setIsPredicted(true);
      if (!autofillFired.current) {
        autofillFired.current = true;
        onAiAutofill?.();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange is stable setState from parent
  }, [predictedValue, value]);

  const handleChange = (newVal: string) => {
    onUserEdited?.();
    onChange(newVal);
    setIsPredicted(false);
  };

  const showBadge = isPredicted && value;
  const useAiColor = highlightAi && value;

  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center">
        {label}
        {showBadge && <PredictiveBadge />}
      </label>
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className={`w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 appearance-none ${
          useAiColor ? AI_SUGGESTED_TEXT_CLASS : "text-foreground"
        }`}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}
