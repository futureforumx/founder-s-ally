import { useRef, useEffect, useState } from "react";
import { Users, Building2, Globe, Target } from "lucide-react";

export type DashboardView = "company" | "competitive" | "industry";

const TABS: { key: DashboardView; label: string; icon: typeof Users }[] = [
  { key: "company", label: "Company", icon: Building2 },
  { key: "industry", label: "Industry", icon: Globe },
  { key: "competitive", label: "Competitive", icon: Target },
];

interface Props {
  active: DashboardView;
  onChange: (view: DashboardView) => void;
}

export function DashboardSegmentedControl({ active, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [slider, setSlider] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const idx = TABS.findIndex(t => t.key === active);
    const buttons = container.querySelectorAll<HTMLButtonElement>("[data-tab]");
    const btn = buttons[idx];
    if (btn) {
      setSlider({ left: btn.offsetLeft, width: btn.offsetWidth });
    }
  }, [active]);

  return (
    <div className="sticky top-0 z-30 -mx-8 px-8 pt-4 pb-3 bg-background/60 backdrop-blur-xl border-b border-border/40">
      <div
        ref={containerRef}
        className="relative mx-auto w-fit flex items-center gap-0.5 rounded-xl bg-muted/50 backdrop-blur-sm border border-border/30 p-1"
      >
        {/* Sliding active indicator */}
        <div
          className="absolute top-1 h-[calc(100%-8px)] rounded-lg bg-card shadow-sm border border-border/50 transition-all duration-300 ease-out"
          style={{ left: slider.left, width: slider.width }}
        />

        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            data-tab={key}
            onClick={() => onChange(key)}
            className={`relative z-10 flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-colors duration-200 ${
              active === key
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/70"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
