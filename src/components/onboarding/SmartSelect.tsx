import { useState, useEffect } from "react";
import { PredictiveBadge } from "./PredictiveBadge";

interface SmartSelectProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  predictedValue?: string;
}

export function SmartSelect({ label, value, onChange, options, predictedValue }: SmartSelectProps) {
  const [isPredicted, setIsPredicted] = useState(false);

  useEffect(() => {
    if (predictedValue && !value) {
      onChange(predictedValue);
      setIsPredicted(true);
    }
  }, [predictedValue]);

  const handleChange = (newVal: string) => {
    onChange(newVal);
    if (newVal !== predictedValue) {
      setIsPredicted(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center">
        {label}
        {isPredicted && value && <PredictiveBadge />}
      </label>
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 appearance-none"
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}
