interface HealthGaugeProps {
  label: string;
  value: number;
  benchmark: number;
  description: string;
  status: "healthy" | "warning" | "critical";
}

const statusColors = {
  healthy: "hsl(var(--success))",
  warning: "hsl(38, 92%, 50%)",
  critical: "hsl(var(--destructive))",
};

const statusLabels = {
  healthy: "On Track",
  warning: "Monitor",
  critical: "At Risk",
};

export function HealthGauge({ label, value, benchmark, description, status }: HealthGaugeProps) {
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (value / 100) * circumference;
  const benchmarkAngle = (benchmark / 100) * 360 - 90;
  const benchmarkX = 50 + 40 * Math.cos((benchmarkAngle * Math.PI) / 180);
  const benchmarkY = 50 + 40 * Math.sin((benchmarkAngle * Math.PI) / 180);

  return (
    <div className="surface-card-hover p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{label}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
        </div>
        <span
          className="rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider border whitespace-nowrap"
          style={{
            backgroundColor: `${statusColors[status]}10`,
            color: statusColors[status],
            borderColor: statusColors[status],
          }}
        >
          {statusLabels[status]}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative h-24 w-24 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(210, 20%, 92%)" strokeWidth="6" />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={statusColors[status]}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-1000"
              style={{ animation: "gauge-fill 1.2s cubic-bezier(0.2, 0, 0, 1) forwards" }}
            />
            <circle cx={benchmarkX} cy={benchmarkY} r="3" fill="hsl(var(--foreground))" opacity="0.3" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold tracking-tight text-foreground">{value}</span>
            <span className="text-[9px] font-mono text-muted-foreground uppercase">/ 100</span>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Score</span>
              <span className="font-mono font-medium text-foreground">{value}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${value}%`, backgroundColor: statusColors[status] }}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <div className="h-1.5 w-1.5 rounded-full bg-foreground/30" />
            <span>Benchmark: {benchmark}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
