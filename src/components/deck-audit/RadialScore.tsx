import { cn } from "@/lib/utils";

interface RadialScoreProps {
  score: number;
  size?: number;
  strokeWidth?: number;
}

function getScoreColor(score: number) {
  if (score >= 80) return { text: "text-emerald-500", stroke: "#2EE6A6", pulse: false };
  if (score >= 50) return { text: "text-amber-500", stroke: "#f59e0b", pulse: true };
  return { text: "text-rose-600", stroke: "#e11d48", pulse: true };
}

export function RadialScore({ score, size = 180, strokeWidth = 11 }: RadialScoreProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const center = size / 2;
  const { text, stroke, pulse } = getScoreColor(score);

  const label =
    score >= 80 ? "Strong" :
    score >= 50 ? "Needs Work" :
    "Weak";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={center} cy={center} r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={center} cy={center} r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
            style={{ filter: `drop-shadow(0 0 6px ${stroke}40)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "text-7xl font-extrabold tabular-nums leading-none",
              text,
              pulse && "animate-pulse"
            )}
          >
            {score}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">{label}</span>
        </div>
      </div>
      <p className="text-xs font-semibold text-foreground">Investor Readiness</p>
    </div>
  );
}
