/** Deterministic synthetic health trend data for the dashboard (no backend yet). */

export type HealthTimeframe = "1M" | "3M" | "6M" | "12M" | "ALL";

export interface TrendPoint {
  /** ISO date yyyy-mm-dd */
  t: string;
  score: number;
}

export interface TrendAnnotation {
  t: string;
  label: string;
}

export interface DriverTrend {
  id: string;
  label: string;
  delta: number;
  sparkline: number[];
}

export interface ChangelogEntry {
  t: string;
  title: string;
  change: number;
  kind: "up" | "down";
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function windowConfig(tf: HealthTimeframe): { points: number; stepDays: number } {
  switch (tf) {
    case "1M":
      return { points: 30, stepDays: 1 };
    case "3M":
      return { points: 14, stepDays: 7 };
    case "6M":
      return { points: 26, stepDays: 7 };
    case "12M":
      return { points: 52, stepDays: 7 };
    case "ALL":
      return { points: 48, stepDays: 14 };
  }
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function buildHealthTrendDataset(
  currentScore: number,
  timeframe: HealthTimeframe,
  seedKey: string,
): {
  series: TrendPoint[];
  benchmark: number;
  annotations: TrendAnnotation[];
  drivers: DriverTrend[];
  changelog: ChangelogEntry[];
  rangeDelta: number;
  vsPriorPeriod: number;
  priorPeriodEnd: number;
} {
  const rng = mulberry32(hashString(seedKey) >>> 0);
  const { points: windowPoints, stepDays } = windowConfig(timeframe);
  const totalPoints = Math.min(120, windowPoints * 2);
  const now = Date.now();

  const startBias = 10 + rng() * 14;
  const startScore = clamp(currentScore - startBias);

  const raw: TrendPoint[] = [];
  for (let i = 0; i < totalPoints; i++) {
    const p = totalPoints > 1 ? i / (totalPoints - 1) : 1;
    const smooth = startScore + (currentScore - startScore) * smoothstep(p);
    const wobble = Math.sin(p * Math.PI * 5 + rng() * 3) * (2.8 + rng() * 2.2);
    const dip = Math.sin(p * Math.PI * 2.1) * (rng() * 4 - 1);
    const d = new Date(now - (totalPoints - 1 - i) * stepDays * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    raw.push({ t: iso, score: clamp(smooth + wobble + dip) });
  }
  raw[raw.length - 1] = { ...raw[raw.length - 1], score: clamp(currentScore) };

  const series = raw.slice(-windowPoints);
  const priorEndIdx = Math.max(0, raw.length - windowPoints - 1);
  const priorPeriodEnd = raw[priorEndIdx]?.score ?? series[0].score;
  const rangeDelta = clamp(series[series.length - 1].score - series[0].score);
  const vsPriorPeriod = clamp(series[series.length - 1].score - priorPeriodEnd);

  const peerBenchmark = clamp(62 + rng() * 12);

  const annLabels = [
    "Profile & metrics refresh",
    "Runway model updated",
    "Enterprise contract closed",
    "Hiring plan revised",
    "Market benchmark shift",
    "GTM channel mix change",
  ];
  const picks = [0.2, 0.5, 0.78];
  const annotations: TrendAnnotation[] = [];
  const usedIdx = new Set<number>();
  for (let k = 0; k < 3; k++) {
    let idx = Math.min(series.length - 1, Math.max(1, Math.floor(picks[k] * (series.length - 1)) + k));
    while (usedIdx.has(idx) && idx > 1) idx -= 1;
    usedIdx.add(idx);
    const label = annLabels[(hashString(seedKey + String(k)) >>> 0) % annLabels.length];
    annotations.push({ t: series[idx].t, label });
  }

  const driverDefs = [
    { id: "financial", label: "Financial health" },
    { id: "gtm", label: "GTM & traction" },
    { id: "market", label: "Market position" },
    { id: "moat", label: "Defensibility" },
  ];

  const drivers: DriverTrend[] = driverDefs.map((d, di) => {
    const r0 = mulberry32(hashString(seedKey + d.id) >>> 0);
    const spark: number[] = [];
    let v = 50 + r0() * 35;
    for (let i = 0; i < 8; i++) {
      v += (r0() - 0.48) * 8;
      spark.push(clamp(v));
    }
    spark[7] = clamp(currentScore * (0.85 + r0() * 0.12) - di * 2);
    const delta = clamp((r0() - 0.35) * 8);
    return { id: d.id, label: d.label, delta, sparkline: spark };
  });

  const changelog: ChangelogEntry[] = [];
  for (let i = 1; i < series.length; i++) {
    const ch = series[i].score - series[i - 1].score;
    if (Math.abs(ch) >= 2 && rng() > 0.55) {
      const titlesUp = [
        "Runway extended after spend discipline",
        "MRR inputs strengthened score",
        "Peer benchmark rebalanced upward",
        "Team & moat signals improved",
      ];
      const titlesDown = [
        "Burn assumptions tightened",
        "Market comps weighed on positioning",
        "One-off metric gap detected",
        "CAC payback stretch modeled",
      ];
      const kind: "up" | "down" = ch >= 0 ? "up" : "down";
      const pool = kind === "up" ? titlesUp : titlesDown;
      changelog.push({
        t: series[i].t,
        title: pool[(hashString(series[i].t + seedKey) >>> 0) % pool.length],
        change: clamp(ch),
        kind,
      });
    }
  }
  changelog.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const topLog = changelog.slice(0, 5);

  return {
    series,
    benchmark: peerBenchmark,
    annotations,
    drivers,
    changelog: topLog.length ? topLog : [
      {
        t: series[Math.max(0, series.length - 2)].t,
        title: "Score steady — awaiting next profile refresh",
        change: 0,
        kind: "up" as const,
      },
    ],
    rangeDelta,
    vsPriorPeriod,
    priorPeriodEnd,
  };
}
