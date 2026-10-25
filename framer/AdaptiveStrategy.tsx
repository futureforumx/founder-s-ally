import * as React from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useTransform, type MotionValue } from "framer-motion"

/**
 * Vekta — Adaptive Fundraising Strategy
 *
 * Step 03 of the marketing “How It Works” sequence. New traction and investor
 * signals are detected, then the fundraising strategy is rewritten. Built for
 * a fixed Framer frame (about 560×440); the two stages share one grid cell so
 * the frame never grows or collapses.
 *
 * Paste this file into Framer → Assets → Code → Create Code File.
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 560
 * @framerIntrinsicHeight 440
 */

const CYCLE = 10000
const SNAPSHOT = 8200

const TEXT = "#F5F7F5"
const MUTED = "#929A94"
const CARD = "#171A18"
const ELEVATED = "#202420"
const BORDER = "rgba(255,255,255,0.08)"
const INK = "#101110"
const FONT = `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
const MONO = `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`

const VB_W = 300
const VB_H = 100
const PLOT_TOP = 16
const PLOT_BOTTOM = 84

const MRR = [
    { label: "18", value: 18 },
    { label: "21", value: 21 },
    { label: "24", value: 24 },
    { label: "29", value: 29 },
    { label: "35", value: 35 },
] as const

interface Point {
    x: number
    y: number
}

function chartPoints(): Point[] {
    const min = 16
    const max = 37
    const innerW = VB_W - 16
    const innerH = PLOT_BOTTOM - PLOT_TOP
    return MRR.map((point, index) => {
        const t = (point.value - min) / (max - min)
        return {
            x: 8 + (index / (MRR.length - 1)) * innerW,
            y: PLOT_TOP + (1 - t) * innerH,
        }
    })
}

const POINTS = chartPoints()

function smoothLine(points: Point[]) {
    const parts = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`]
    for (let index = 0; index < points.length - 1; index++) {
        const p0 = points[Math.max(0, index - 1)]
        const p1 = points[index]
        const p2 = points[index + 1]
        const p3 = points[Math.min(points.length - 1, index + 2)]
        const c1x = p1.x + (p2.x - p0.x) / 6
        const c1y = p1.y + (p2.y - p0.y) / 6
        const c2x = p2.x - (p3.x - p1.x) / 6
        const c2y = p2.y - (p3.y - p1.y) / 6
        parts.push(
            `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
        )
    }
    return parts.join(" ")
}

const LINE_PATH = smoothLine(POINTS)
const AREA_PATH = `${LINE_PATH} L ${POINTS[POINTS.length - 1].x.toFixed(1)} ${PLOT_BOTTOM} L ${POINTS[0].x.toFixed(1)} ${PLOT_BOTTOM} Z`

const SIGNALS = [
    {
        id: "mrr",
        title: "Monthly recurring revenue increased 21%, strengthening your traction narrative.",
        enter: 2100,
        icon: "trend" as const,
    },
    {
        id: "investors",
        title: "3 investors requested additional traction details.",
        enter: 2850,
        icon: "users" as const,
    },
] as const

const RECS = [
    {
        id: "traction",
        n: "01",
        title: "Highlight New Traction",
        body: "Update investor messaging to emphasize the latest revenue growth.",
        enter: 5900,
        icon: "trend" as const,
    },
    {
        id: "focus",
        n: "02",
        title: "Prioritize Growth-Focused Investors",
        body: "Focus outreach on Seed funds that value demonstrated revenue momentum.",
        enter: 6600,
        icon: "target" as const,
    },
    {
        id: "follow",
        n: "03",
        title: "Strengthen Investor Follow-Ups",
        body: "Share updated financial metrics with investors requesting traction details.",
        enter: 7300,
        icon: "message" as const,
    },
] as const

interface AdaptiveStrategyProps {
    accentColor: string
    backgroundColor: string
    animationSpeed: number
    autoPlay: boolean
    showChart: boolean
    showInvestorSignals: boolean
    showRecommendations: boolean
    borderRadius: number
    style?: React.CSSProperties
}

const DEFAULTS: AdaptiveStrategyProps = {
    accentColor: "#4ADE80",
    backgroundColor: "#101110",
    animationSpeed: 1,
    autoPlay: true,
    showChart: true,
    showInvestorSignals: true,
    showRecommendations: true,
    borderRadius: 16,
}

function clamp01(value: number) {
    return Math.min(1, Math.max(0, value))
}

function easeOutCubic(value: number) {
    return 1 - Math.pow(1 - value, 3)
}

function easeInCubic(value: number) {
    return value * value * value
}

function easeInOutCubic(value: number) {
    return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2
}

function mix(color: string, amount: number) {
    return `color-mix(in srgb, ${color} ${Math.round(amount * 100)}%, transparent)`
}

function chartDraw(time: number) {
    if (time < 180 || time >= 5600) return 0
    if (time < 1680) return easeInOutCubic((time - 180) / 1500)
    return 1
}

function monitorPresence(time: number, showRecommendations: boolean) {
    if (!showRecommendations) return 1
    if (time < 5300) return 1
    if (time < 5950) return 1 - easeInCubic((time - 5300) / 650)
    if (time < 9050) return 0
    if (time < 9700) return easeOutCubic((time - 9050) / 650)
    return 1
}

function strategyPresence(time: number, showRecommendations: boolean) {
    if (!showRecommendations) return 0
    if (time < 5480 || time >= 9850) return 0
    if (time < 6120) return easeOutCubic((time - 5480) / 640)
    if (time < 9000) return 1
    return 1 - easeInCubic((time - 9000) / 850)
}

function badgeLevel(time: number) {
    if (time < 1520 || time >= 5500) return 0
    if (time < 1880) return easeOutCubic((time - 1520) / 360)
    return 1
}

function signalLevel(time: number, enter: number) {
    const floor = 0.34
    let progress = 0
    if (time >= enter && time < enter + 420) progress = easeOutCubic((time - enter) / 420)
    else if (time >= enter + 420 && time < 5200) progress = 1
    else if (time >= 5200 && time < 5650) progress = 1 - easeInCubic((time - 5200) / 450)
    return floor + (1 - floor) * progress
}

function signalWash(time: number, enter: number) {
    const start = enter + 80
    const peak = enter + 420
    const end = enter + 1100
    if (time < start || time > end) return 0
    if (time < peak) return easeOutCubic((time - start) / (peak - start))
    return 1 - easeInCubic((time - peak) / (end - peak))
}

function recLevel(time: number, enter: number) {
    const floor = 0.28
    let progress = 0
    if (time >= enter && time < enter + 400) progress = easeOutCubic((time - enter) / 400)
    else if (time >= enter + 400 && time < 8800) progress = 1
    else if (time >= 8800 && time < 9450) progress = 1 - easeInCubic((time - 8800) / 650)
    return { shown: floor + (1 - floor) * progress, locked: progress }
}

function refineProgress(time: number, showRecommendations: boolean) {
    if (!showRecommendations) return 0
    if (time < 4000 || time >= 9700) return 0
    if (time < 5500) return easeInOutCubic((time - 4000) / 1500)
    if (time < 9000) return 1
    return 1 - easeInCubic((time - 9000) / 700)
}

function readStatus(time: number, showRecommendations: boolean) {
    if (showRecommendations && time >= 5500 && time < 9150) {
        return { label: "Strategy updated", complete: true, refining: false }
    }
    if (showRecommendations && time >= 4000 && time < 5500) {
        return { label: "Refining your strategy...", complete: false, refining: true }
    }
    if (time >= 2000 && time < (showRecommendations ? 4000 : 8600)) {
        return { label: "New signal detected", complete: false, refining: false }
    }
    return { label: "Monitoring momentum", complete: false, refining: false }
}

function isFrozenTarget() {
    try {
        const target = RenderTarget.current()
        return target === RenderTarget.export || target === RenderTarget.thumbnail
    } catch {
        return false
    }
}

function prefersReducedMotion() {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function useAdaptiveClock(playing: boolean, speedRef: React.MutableRefObject<number>, snapshot: number) {
    const time = useMotionValue(playing ? 0 : snapshot)

    React.useEffect(() => {
        if (!playing) {
            time.set(snapshot)
            return
        }

        let frame = 0
        let last = performance.now()

        const tick = (now: number) => {
            const delta = Math.min(48, now - last)
            last = now
            time.set((time.get() + delta * speedRef.current) % CYCLE)
            frame = requestAnimationFrame(tick)
        }

        const stop = () => cancelAnimationFrame(frame)
        const start = () => {
            stop()
            last = performance.now()
            frame = requestAnimationFrame(tick)
        }

        time.set(0)

        const onVisibility = () => {
            if (document.hidden) stop()
            else start()
        }

        if (!document.hidden) start()
        document.addEventListener("visibilitychange", onVisibility)

        return () => {
            stop()
            document.removeEventListener("visibilitychange", onVisibility)
        }
    }, [playing, snapshot, speedRef, time])

    return time
}

function Glyph({ name, size = 15 }: { name: "trend" | "users" | "spark" | "target" | "message" | "check"; size?: number }) {
    const common = {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: name === "check" ? 2.4 : 1.75,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        "aria-hidden": true,
    }
    if (name === "trend") {
        return (
            <svg {...common}>
                <path d="M16 7h6v6" />
                <path d="m22 7-8.5 8.5-5-5L2 17" />
            </svg>
        )
    }
    if (name === "users") {
        return (
            <svg {...common}>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
        )
    }
    if (name === "spark") {
        return (
            <svg {...common}>
                <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                <path d="M20 3v4" />
                <path d="M22 5h-4" />
                <path d="M4 17v2" />
                <path d="M5 18H3" />
            </svg>
        )
    }
    if (name === "target") {
        return (
            <svg {...common}>
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
            </svg>
        )
    }
    if (name === "message") {
        return (
            <svg {...common}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
        )
    }
    return (
        <svg {...common}>
            <path d="M20 6 9 17l-5-5" />
        </svg>
    )
}

function IconWell({ name, accent, active }: { name: React.ComponentProps<typeof Glyph>["name"]; accent: string; active: MotionValue<number> }) {
    const color = useTransform(active, (value) => (value > 0.65 ? accent : MUTED))
    return (
        <motion.span
            style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                display: "grid",
                placeItems: "center",
                flex: "none",
                background: ELEVATED,
                color,
            }}
        >
            <Glyph name={name} />
        </motion.span>
    )
}

function MomentumChart(props: { time: MotionValue<number>; accent: string; show: boolean }) {
    const reactId = React.useId().replace(/:/g, "")
    const clipId = `vekta-as-clip-${reactId}`
    const fadeId = `vekta-as-fade-${reactId}`
    const draw = useTransform(props.time, chartDraw)
    const badge = useTransform(props.time, badgeLevel)
    const badgeY = useTransform(badge, (value) => (1 - value) * 6)
    const clipWidth = useTransform(draw, (value) => value * VB_W)
    const pointGlow = useTransform(draw, (value) => (value > 0.96 ? 0.85 : 0))
    const last = POINTS[POINTS.length - 1]

    if (!props.show) return null

    return (
        <div
            style={{
                background: CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: "var(--inner)",
                padding: "12px 12px 10px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minHeight: 0,
                flex: "1 1 auto",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12, lineHeight: 1.3, fontWeight: 600, color: TEXT }}>MRR</span>
                <motion.span
                    style={{
                        opacity: badge,
                        y: badgeY,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: mix(props.accent, 0.12),
                        color: props.accent,
                        fontSize: 11,
                        lineHeight: 1.3,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                    }}
                >
                    <Glyph name="trend" size={12} />
                    +21% MRR Growth
                </motion.span>
            </div>

            <div style={{ flex: "1 1 88px", minHeight: 78 }}>
                <svg
                    viewBox={`0 0 ${VB_W} ${VB_H}`}
                    width="100%"
                    height="100%"
                    role="img"
                    aria-label="Monthly recurring revenue rising from $18K to $35K"
                    style={{ display: "block", overflow: "visible" }}
                >
                    <defs>
                        <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={props.accent} stopOpacity="0.16" />
                            <stop offset="100%" stopColor={props.accent} stopOpacity="0" />
                        </linearGradient>
                        <clipPath id={clipId}>
                            <motion.rect x="0" y="0" height={VB_H} style={{ width: clipWidth }} />
                        </clipPath>
                    </defs>
                    {[0.35, 0.65].map((mark) => {
                        const y = PLOT_TOP + (1 - mark) * (PLOT_BOTTOM - PLOT_TOP)
                        return (
                            <line
                                key={mark}
                                x1="4"
                                x2={VB_W - 4}
                                y1={y}
                                y2={y}
                                stroke="rgba(255,255,255,0.06)"
                                strokeWidth="1"
                            />
                        )
                    })}
                    <g clipPath={`url(#${clipId})`}>
                        <path d={AREA_PATH} fill={`url(#${fadeId})`} />
                        <path
                            d={LINE_PATH}
                            fill="none"
                            stroke={props.accent}
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                        />
                    </g>
                    {POINTS.map((point, index) => (
                        <ChartDot
                            key={MRR[index].label}
                            point={point}
                            draw={draw}
                            index={index}
                            accent={props.accent}
                            last={index === POINTS.length - 1}
                        />
                    ))}
                    <motion.circle
                        className="vekta-as-pulse"
                        cx={last.x}
                        cy={last.y}
                        r="7"
                        fill="none"
                        stroke={props.accent}
                        strokeWidth="1"
                        style={{ opacity: pointGlow }}
                    />
                </svg>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 4 }}>
                {MRR.map((point) => (
                    <span
                        key={point.label}
                        style={{
                            fontSize: 10,
                            lineHeight: 1.2,
                            color: MUTED,
                            fontVariantNumeric: "tabular-nums",
                            textAlign: "center",
                        }}
                    >
                        {point.label}k
                    </span>
                ))}
            </div>
        </div>
    )
}

function ChartDot(props: {
    point: Point
    draw: MotionValue<number>
    index: number
    accent: string
    last: boolean
}) {
    const opacity = useTransform(props.draw, (value) => clamp01((value - props.index / 4) / 0.08))
    return (
        <motion.circle
            cx={props.point.x}
            cy={props.point.y}
            r={props.last ? 3.4 : 2.4}
            fill={props.last ? props.accent : "#171A18"}
            stroke={props.accent}
            strokeWidth={props.last ? 0 : 1.25}
            style={{ opacity }}
        />
    )
}

function SignalRow(props: {
    time: MotionValue<number>
    accent: string
    text: string
    enter: number
    icon: "trend" | "users"
}) {
    const level = useTransform(props.time, (value) => signalLevel(value, props.enter))
    const wash = useTransform(props.time, (value) => signalWash(value, props.enter))
    const y = useTransform(level, (value) => (1 - (value - 0.34) / 0.66) * 6)
    const background = useTransform(wash, (value) => `color-mix(in srgb, ${props.accent} ${Math.round(value * 18)}%, transparent)`)
    const active = useTransform(level, (value) => clamp01((value - 0.34) / 0.66))

    return (
        <motion.div
            style={{
                opacity: level,
                y,
                background,
                borderRadius: 10,
                display: "grid",
                gridTemplateColumns: "28px minmax(0, 1fr)",
                gap: 10,
                alignItems: "center",
                padding: "4px 4px",
            }}
        >
            <IconWell name={props.icon} accent={props.accent} active={active} />
            <span style={{ fontSize: "var(--body)", lineHeight: 1.4, color: TEXT }}>{props.text}</span>
        </motion.div>
    )
}

function SignalCard(props: { time: MotionValue<number>; accent: string; show: boolean }) {
    const header = useTransform(props.time, (value) => {
        if (value < 1700) return 0.4
        if (value < 2050) return 0.4 + easeOutCubic((value - 1700) / 350) * 0.6
        if (value < 5300) return 1
        if (value < 5750) return 1 - easeInCubic((value - 5300) / 450)
        return 0.4
    })

    if (!props.show) return null

    return (
        <div
            style={{
                background: CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: "var(--inner)",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                flex: "0 0 auto",
            }}
        >
            <motion.div style={{ display: "flex", alignItems: "center", gap: 7, opacity: header }}>
                <span style={{ color: props.accent, display: "grid" }}>
                    <Glyph name="spark" size={14} />
                </span>
                <span style={{ fontSize: 12.5, lineHeight: 1.3, fontWeight: 600, color: TEXT }}>New Signal Detected</span>
            </motion.div>
            {SIGNALS.map((signal) => (
                <SignalRow
                    key={signal.id}
                    time={props.time}
                    accent={props.accent}
                    text={signal.title}
                    enter={signal.enter}
                    icon={signal.icon}
                />
            ))}
        </div>
    )
}

function RecommendationRow(props: {
    time: MotionValue<number>
    accent: string
    n: string
    title: string
    body: string
    enter: number
    icon: "trend" | "target" | "message"
}) {
    const level = useTransform(props.time, (value) => recLevel(value, props.enter))
    const shown = useTransform(level, (value) => value.shown)
    const locked = useTransform(level, (value) => value.locked)
    const y = useTransform(locked, (value) => (1 - value) * 6)

    return (
        <motion.div
            style={{
                opacity: shown,
                y,
                display: "grid",
                gridTemplateColumns: "28px minmax(0, 1fr)",
                gap: 10,
                alignItems: "start",
            }}
        >
            <IconWell name={props.icon} accent={props.accent} active={locked} />
            <div style={{ minWidth: 0, paddingTop: 1 }}>
                <div>
                    <motion.span
                        style={{
                            opacity: locked,
                            float: "right",
                            marginLeft: 8,
                            marginTop: 1,
                            padding: "2px 6px",
                            borderRadius: 999,
                            background: mix(props.accent, 0.12),
                            color: props.accent,
                            fontSize: 10,
                            lineHeight: 1.3,
                            fontWeight: 600,
                        }}
                    >
                        New
                    </motion.span>
                    <span
                        style={{
                            fontFamily: MONO,
                            fontSize: 10,
                            lineHeight: 1.45,
                            color: MUTED,
                            marginRight: 8,
                        }}
                    >
                        {props.n}
                    </span>
                    <span
                        style={{
                            fontSize: "var(--step)",
                            lineHeight: 1.35,
                            fontWeight: 600,
                            letterSpacing: "-0.015em",
                            color: TEXT,
                        }}
                    >
                        {props.title}
                    </span>
                </div>
                <div style={{ clear: "both", marginTop: 3, fontSize: "var(--body)", lineHeight: 1.4, color: MUTED }}>
                    {props.body}
                </div>
            </div>
        </motion.div>
    )
}

function StageHeader(props: {
    time: MotionValue<number>
    accent: string
    showRecommendations: boolean
    reduced: boolean
}) {
    const monitor = useTransform(props.time, (value) => monitorPresence(value, props.showRecommendations))
    const strategy = useTransform(props.time, (value) => strategyPresence(value, props.showRecommendations))
    const bar = useTransform(props.time, (value) => refineProgress(value, props.showRecommendations))
    const [status, setStatus] = React.useState(() => readStatus(props.time.get(), props.showRecommendations))
    const [strategyTitle, setStrategyTitle] = React.useState(() => strategy.get() > 0.45)

    useMotionValueEvent(strategy, "change", (value) => {
        const on = value > 0.45
        setStrategyTitle((current) => (current === on ? current : on))
    })

    useMotionValueEvent(props.time, "change", (value) => {
        const next = readStatus(value, props.showRecommendations)
        setStatus((current) =>
            current.label === next.label && current.complete === next.complete && current.refining === next.refining
                ? current
                : next
        )
    })

    React.useEffect(() => {
        setStatus(readStatus(props.time.get(), props.showRecommendations))
    }, [props.showRecommendations, props.time])

    return (
        <div style={{ flex: "none" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                }}
            >
                <div style={{ display: "grid", flex: "1 1 200px", minWidth: 0 }}>
                    <motion.div aria-hidden={strategyTitle} style={{ gridArea: "1 / 1", opacity: monitor }}>
                        <h2 style={titleStyle}>Fundraising Momentum</h2>
                        <p style={subtitleStyle}>Tracking company and investor signals</p>
                    </motion.div>
                    <motion.div aria-hidden={!strategyTitle} style={{ gridArea: "1 / 1", opacity: strategy }}>
                        <h2 style={titleStyle}>Strategy Updated</h2>
                        <p style={subtitleStyle}>Recommendations adjusted based on new company signals.</p>
                    </motion.div>
                </div>
                <div
                    aria-live="polite"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        minHeight: 22,
                        maxWidth: "100%",
                        paddingTop: 2,
                    }}
                >
                    {status.complete ? (
                        <span
                            aria-hidden="true"
                            style={{
                                width: 14,
                                height: 14,
                                borderRadius: 99,
                                display: "grid",
                                placeItems: "center",
                                background: props.accent,
                                color: INK,
                                flex: "none",
                            }}
                        >
                            <Glyph name="check" size={10} />
                        </span>
                    ) : status.refining ? (
                        <span aria-hidden="true" style={{ display: "inline-flex", gap: 3, flex: "none" }}>
                            {[0, 1, 2].map((dot) => (
                                <span
                                    key={dot}
                                    className="vekta-as-blink"
                                    style={{ animationDelay: `${dot * 160}ms`, background: props.accent }}
                                />
                            ))}
                        </span>
                    ) : (
                        <span aria-hidden="true" className="vekta-as-dot vekta-as-dot-live" style={{ background: props.accent }} />
                    )}
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                            key={status.label}
                            initial={props.reduced ? false : { opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={props.reduced ? { opacity: 1 } : { opacity: 0, y: -4 }}
                            transition={{ duration: props.reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                            style={{ fontSize: 12, lineHeight: 1.35, color: status.complete ? TEXT : MUTED }}
                        >
                            {status.label}
                        </motion.span>
                    </AnimatePresence>
                </div>
            </div>
            <div
                aria-hidden="true"
                style={{
                    marginTop: 10,
                    height: 2,
                    borderRadius: 99,
                    background: "rgba(255,255,255,0.06)",
                    overflow: "hidden",
                }}
            >
                <motion.div
                    style={{
                        height: "100%",
                        width: "100%",
                        background: props.accent,
                        scaleX: bar,
                        transformOrigin: "left center",
                    }}
                />
            </div>
        </div>
    )
}

const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: "var(--title)",
    lineHeight: 1.25,
    fontWeight: 600,
    letterSpacing: "-0.02em",
    color: TEXT,
}

const subtitleStyle: React.CSSProperties = {
    margin: "3px 0 0",
    fontSize: 12,
    lineHeight: 1.4,
    color: MUTED,
}

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 560
 * @framerIntrinsicHeight 440
 */
export default function AdaptiveStrategy(props: Partial<AdaptiveStrategyProps>) {
    const {
        accentColor = DEFAULTS.accentColor,
        backgroundColor = DEFAULTS.backgroundColor,
        animationSpeed = DEFAULTS.animationSpeed,
        autoPlay = DEFAULTS.autoPlay,
        showChart = DEFAULTS.showChart,
        showInvestorSignals = DEFAULTS.showInvestorSignals,
        showRecommendations = DEFAULTS.showRecommendations,
        borderRadius = DEFAULTS.borderRadius,
        style,
    } = props

    const [reduced, setReduced] = React.useState(prefersReducedMotion)
    const speedRef = React.useRef(1)
    speedRef.current = Math.min(2.5, Math.max(0.35, animationSpeed || 1))
    const snapshot = showRecommendations ? SNAPSHOT : 3400
    const playing = autoPlay && !reduced && !isFrozenTarget()
    const time = useAdaptiveClock(playing, speedRef, snapshot)

    const monitor = useTransform(time, (value) => monitorPresence(value, showRecommendations))
    const strategy = useTransform(time, (value) => strategyPresence(value, showRecommendations))
    const [monitorOn, setMonitorOn] = React.useState(() => monitor.get() > 0.35)
    const [strategyOn, setStrategyOn] = React.useState(() => strategy.get() > 0.35)

    useMotionValueEvent(monitor, "change", (value) => {
        const on = value > 0.35
        setMonitorOn((current) => (current === on ? current : on))
    })
    useMotionValueEvent(strategy, "change", (value) => {
        const on = value > 0.35
        setStrategyOn((current) => (current === on ? current : on))
    })

    React.useEffect(() => {
        const query = window.matchMedia("(prefers-reduced-motion: reduce)")
        const onChange = () => setReduced(query.matches)
        query.addEventListener("change", onChange)
        return () => query.removeEventListener("change", onChange)
    }, [])

    const radius = Math.max(0, borderRadius)

    return (
        <section
            className="vekta-as"
            aria-label="Adaptive fundraising strategy"
            style={{
                width: "100%",
                height: "100%",
                position: "relative",
                boxSizing: "border-box",
                overflow: "hidden",
                background: backgroundColor,
                color: TEXT,
                border: `1px solid ${BORDER}`,
                borderRadius: radius,
                fontFamily: FONT,
                WebkitFontSmoothing: "antialiased",
                ...style,
                background: backgroundColor,
                color: TEXT,
                borderRadius: radius,
                boxSizing: "border-box",
                overflow: "hidden",
                fontFamily: FONT,
                ["--accent" as string]: accentColor,
                ["--inner" as string]: `${Math.max(8, radius - 4)}px`,
            }}
        >
            <style>{STYLES}</style>
            <div
                style={{
                    height: "100%",
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    padding: "var(--inset)",
                    boxSizing: "border-box",
                }}
            >
                <StageHeader
                    time={time}
                    accent={accentColor}
                    showRecommendations={showRecommendations}
                    reduced={reduced || !playing}
                />
                <div
                    style={{
                        flex: "1 1 auto",
                        minHeight: 0,
                        display: "grid",
                        gridTemplateRows: "minmax(0, 1fr)",
                    }}
                >
                    <motion.div
                        aria-hidden={!monitorOn}
                        style={{
                            gridArea: "1 / 1",
                            minHeight: 0,
                            overflow: "hidden",
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                            opacity: monitor,
                            pointerEvents: monitorOn ? "auto" : "none",
                        }}
                    >
                        <MomentumChart time={time} accent={accentColor} show={showChart} />
                        <SignalCard time={time} accent={accentColor} show={showInvestorSignals} />
                    </motion.div>
                    <motion.div
                        aria-hidden={!strategyOn}
                        style={{
                            gridArea: "1 / 1",
                            minHeight: 0,
                            overflow: "hidden",
                            opacity: strategy,
                            alignSelf: "stretch",
                            pointerEvents: strategyOn ? "auto" : "none",
                        }}
                    >
                        <div
                            style={{
                                height: "100%",
                                minHeight: 0,
                                background: CARD,
                                border: `1px solid ${BORDER}`,
                                borderRadius: "var(--inner)",
                                padding: "12px",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "space-between",
                                gap: "var(--rec-gap)",
                                overflow: "hidden",
                            }}
                        >
                            {showRecommendations
                                ? RECS.map((item) => (
                                      <RecommendationRow
                                          key={item.id}
                                          time={time}
                                          accent={accentColor}
                                          n={item.n}
                                          title={item.title}
                                          body={item.body}
                                          enter={item.enter}
                                          icon={item.icon}
                                      />
                                  ))
                                : null}
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    )
}

AdaptiveStrategy.defaultProps = DEFAULTS
AdaptiveStrategy.displayName = "Adaptive Strategy"

const STYLES = `
.vekta-as { container: vekta-as / inline-size; }
.vekta-as, .vekta-as * { box-sizing: border-box; }
.vekta-as {
  --inset: 16px;
  --title: 15px;
  --step: 13px;
  --body: 12.5px;
  --rec-gap: 14px;
}
.vekta-as-dot {
  width: 6px;
  height: 6px;
  border-radius: 99px;
  flex: none;
}
.vekta-as-dot-live { animation: vekta-as-pulse-dot 1.8s ease-in-out infinite; }
.vekta-as-blink {
  width: 4px;
  height: 4px;
  border-radius: 99px;
  animation: vekta-as-blink 1.1s ease-in-out infinite;
}
.vekta-as-pulse {
  animation: vekta-as-ring 1.8s ease-in-out infinite;
}
@keyframes vekta-as-pulse-dot {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(0.72); opacity: 0.4; }
}
@keyframes vekta-as-blink {
  0%, 80%, 100% { opacity: 0.25; }
  40% { opacity: 1; }
}
@keyframes vekta-as-ring {
  0%, 100% { opacity: 0.15; }
  45% { opacity: 0.7; }
}
@container vekta-as (max-width: 420px) {
  .vekta-as {
    --inset: 12px;
    --title: 14px;
    --step: 12.5px;
    --body: 12px;
    --rec-gap: 10px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .vekta-as-dot-live,
  .vekta-as-blink,
  .vekta-as-pulse { animation: none; }
}
`

addPropertyControls(AdaptiveStrategy, {
    accentColor: {
        type: ControlType.Color,
        title: "Accent Color",
        defaultValue: DEFAULTS.accentColor,
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "Background Color",
        defaultValue: DEFAULTS.backgroundColor,
    },
    animationSpeed: {
        type: ControlType.Number,
        title: "Animation Speed",
        description: "1 plays the full sequence in 10 seconds.",
        defaultValue: DEFAULTS.animationSpeed,
        min: 0.5,
        max: 2,
        step: 0.1,
    },
    autoPlay: {
        type: ControlType.Boolean,
        title: "Auto Play",
        defaultValue: DEFAULTS.autoPlay,
        enabledTitle: "On",
        disabledTitle: "Off",
    },
    showChart: {
        type: ControlType.Boolean,
        title: "Show Chart",
        defaultValue: DEFAULTS.showChart,
        enabledTitle: "Show",
        disabledTitle: "Hide",
    },
    showInvestorSignals: {
        type: ControlType.Boolean,
        title: "Show Investor Signals",
        defaultValue: DEFAULTS.showInvestorSignals,
        enabledTitle: "Show",
        disabledTitle: "Hide",
    },
    showRecommendations: {
        type: ControlType.Boolean,
        title: "Show Recommendations",
        defaultValue: DEFAULTS.showRecommendations,
        enabledTitle: "Show",
        disabledTitle: "Hide",
    },
    borderRadius: {
        type: ControlType.Number,
        title: "Border Radius",
        defaultValue: DEFAULTS.borderRadius,
        min: 0,
        max: 32,
        step: 1,
        unit: "px",
    },
})
