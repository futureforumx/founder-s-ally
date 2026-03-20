import { cn } from "@/lib/utils";

interface RadialScoreProps {
  score: number;
  size?: number;
  strokeWidth?: number;
}

export function RadialScore({ score, size = 160, strokeWidth = 10 }: RadialScoreProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const center = size / 2;

  const color =
    score >= 75 ? "hsl(var(--success))" :
    score >= 50 ? "hsl(var(--warning))" :
    "hsl(var(--destructive))";

  const label =
    score >= 75 ? "Strong" :
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
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold text-foreground tabular-nums">{score}</span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
      </div>
      <p className="text-xs font-semibold text-foreground">Investor Readiness</p>
    </div>
  );
}
