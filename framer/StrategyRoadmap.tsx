import * as React from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"
import {
    motion,
    useMotionValue,
    useMotionValueEvent,
    useTransform,
    type MotionValue,
} from "framer-motion"

/**
 * Vekta — Fundraising Strategy
 *
 * Product demonstration for a Framer marketing page. A fixed 8-second clock
 * writes a four-step fundraising roadmap, then reveals a company-specific
 * investor recommendation. Roadmap rows stay put; the recommendation expands
 * in and collapses back to the same height so the loop can restart cleanly.
 *
 * Paste this file into a Framer code component as-is.
 * Requires the Framer runtime (`framer`, `framer-motion`, `react`).
 *
 * @framerIntrinsicWidth 560
 * @framerIntrinsicHeight 640
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */

const CYCLE = 8000
const SNAPSHOT = 6400
const EXIT_START = 7420
const EXIT_END = 8000

const TEXT = "#F5F7F5"
const MUTED = "#929A94"
const CARD = "#171A18"
const BORDER = "rgba(255,255,255,0.08)"
const INK = "#101110"
const FONT = `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
const MONO = `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`

const STEPS = [
    {
        id: "goals",
        n: "01",
        title: "Define Fundraising Goals",
        body: "Capital requirements and funding milestones.",
        show: 1000,
        done: 1320,
        line: 1640,
    },
    {
        id: "investors",
        n: "02",
        title: "Identify Ideal Investors",
        body: "Investor profiles aligned with stage, sector, and check size.",
        show: 2000,
        done: 2320,
        line: 2640,
    },
    {
        id: "outreach",
        n: "03",
        title: "Develop Outreach Strategy",
        body: "Prioritized investor engagement and tailored messaging.",
        show: 3000,
        done: 3320,
        line: 3640,
    },
    {
        id: "execution",
        n: "04",
        title: "Build Execution Roadmap",
        body: "A clear action plan for moving the round forward.",
        show: 4000,
        done: 4360,
        line: 0,
    },
] as const

interface StrategyRoadmapProps {
    accentColor: string
    backgroundColor: string
    raiseTarget: string
    fundingStage: string
    investorTarget: string
    animationSpeed: number
    autoPlay: boolean
    showRecommendation: boolean
    borderRadius: number
    style?: React.CSSProperties
}

const DEFAULTS: StrategyRoadmapProps = {
    accentColor: "#4ADE80",
    backgroundColor: "#101110",
    raiseTarget: "$2.5M",
    fundingStage: "Seed",
    investorTarget: "75–100",
    animationSpeed: 1,
    autoPlay: true,
    showRecommendation: true,
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

/** 0 before enter, 1 through the hold, 0 again before the clock wraps. */
function envelope(time: number, enter0: number, enter1: number) {
    if (time <= enter0 || time >= EXIT_END) return 0
    if (time < enter1) return easeOutCubic(clamp01((time - enter0) / (enter1 - enter0)))
    if (time < EXIT_START) return 1
    return 1 - easeInCubic(clamp01((time - EXIT_START) / (EXIT_END - EXIT_START)))
}

function mix(color: string, amount: number) {
    return `color-mix(in srgb, ${color} ${Math.round(amount * 100)}%, transparent)`
}

function readStatus(time: number) {
    if (time >= 5000 && time < EXIT_START) {
        return { label: "Strategy generated", complete: true }
    }
    if (time >= 1000 && time < 5000) {
        return { label: "Building your roadmap", complete: false }
    }
    return { label: "Analyzing fundraising objectives", complete: false }
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

function useStrategyClock(playing: boolean, speedRef: React.MutableRefObject<number>) {
    const time = useMotionValue(playing ? 0 : SNAPSHOT)

    React.useEffect(() => {
        if (!playing) {
            time.set(SNAPSHOT)
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
    }, [playing, speedRef, time])

    return time
}

function CheckIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M20 6 9 17l-5-5" />
        </svg>
    )
}

function SparkleIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
            <path d="M20 3v4" />
            <path d="M22 5h-4" />
            <path d="M4 17v2" />
            <path d="M5 18H3" />
        </svg>
    )
}

function Metric(props: { label: string; value: string; enter: number; time: MotionValue<number> }) {
    const opacity = useTransform(props.time, (value) => envelope(value, props.enter, props.enter + 320))
    const y = useTransform(opacity, (value) => (1 - value) * 7)

    return (
        <div
            style={{
                minWidth: 0,
                background: CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: "var(--inner)",
                padding: "10px 10px 9px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
            }}
        >
            <span
                style={{
                    fontSize: 10,
                    lineHeight: 1.35,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: MUTED,
                    fontWeight: 500,
                }}
            >
                {props.label}
            </span>
            <motion.span
                style={{
                    opacity,
                    y,
                    marginTop: "auto",
                    minHeight: "1.2em",
                    fontSize: "var(--metric)",
                    lineHeight: 1.2,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    color: TEXT,
                    fontVariantNumeric: "tabular-nums",
                    overflowWrap: "anywhere",
                }}
            >
                {props.value}
            </motion.span>
        </div>
    )
}

function Milestone(props: {
    time: MotionValue<number>
    accent: string
    surface: string
    n: string
    title: string
    body: string
    show: number
    doneAt: number
    lineAt: number
    isLast: boolean
}) {
    const progress = useTransform(props.time, (value) => envelope(value, props.show, props.show + 360))
    const shown = useTransform(progress, (value) => 0.34 + value * 0.66)
    const done = useTransform(props.time, (value) => envelope(value, props.doneAt, props.doneAt + 280))
    const line = useTransform(props.time, (value) =>
        props.isLast ? 0 : envelope(value, props.lineAt, props.lineAt + 360)
    )
    const textY = useTransform(progress, (value) => (1 - value) * 6)
    const numberOpacity = useTransform(done, (value) => 1 - value)
    const checkScale = useTransform(done, (value) => 0.7 + value * 0.3)
    const ring = useTransform([progress, done], ([show, finished]: number[]) => show * (1 - finished))

    return (
        <li
            style={{
                position: "relative",
                display: "grid",
                gridTemplateColumns: "var(--node) minmax(0, 1fr)",
                columnGap: 12,
                paddingBottom: props.isLast ? 0 : "var(--step-gap)",
                margin: 0,
            }}
        >
            {props.isLast ? null : (
                <div
                    aria-hidden="true"
                    style={{
                        position: "absolute",
                        left: "calc(var(--node) / 2)",
                        top: "calc(var(--node) - 1px)",
                        bottom: 0,
                        width: 1,
                        transform: "translateX(-0.5px)",
                        background: BORDER,
                    }}
                >
                    <motion.div
                        style={{
                            position: "absolute",
                            inset: 0,
                            background: props.accent,
                            scaleY: line,
                            transformOrigin: "top center",
                        }}
                    />
                </div>
            )}

            <div
                aria-hidden="true"
                style={{
                    position: "relative",
                    zIndex: 1,
                    width: "var(--node)",
                    height: "var(--node)",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "50%",
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: props.surface,
                    }}
                />
                <motion.div
                    style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "50%",
                        background: props.accent,
                        opacity: done,
                        scale: checkScale,
                    }}
                />
                <motion.div
                    style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "50%",
                        border: `1.5px solid ${props.accent}`,
                        opacity: ring,
                    }}
                />
                <motion.span
                    className="vekta-sr-num"
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        opacity: numberOpacity,
                        color: MUTED,
                        fontFamily: MONO,
                        fontWeight: 500,
                        letterSpacing: "0.02em",
                    }}
                >
                    {props.n}
                </motion.span>
                <motion.span
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        color: INK,
                        opacity: done,
                        scale: checkScale,
                    }}
                >
                    <CheckIcon />
                </motion.span>
            </div>

            <motion.div style={{ opacity: shown, y: textY, minWidth: 0, paddingTop: 2 }}>
                <div
                    style={{
                        fontSize: "var(--step)",
                        lineHeight: 1.3,
                        fontWeight: 600,
                        letterSpacing: "-0.015em",
                        color: TEXT,
                    }}
                >
                    {props.title}
                </div>
                <div
                    style={{
                        marginTop: 3,
                        fontSize: "var(--body)",
                        lineHeight: 1.45,
                        color: MUTED,
                    }}
                >
                    {props.body}
                </div>
            </motion.div>
        </li>
    )
}

function Recommendation(props: {
    time: MotionValue<number>
    accent: string
    stage: string
    show: boolean
}) {
    const reveal = useTransform(props.time, (value) => envelope(value, 5120, 5620))
    const y = useTransform(reveal, (value) => (1 - value) * 8)
    const bars = useTransform(props.time, (value) => 1 - envelope(value, 4960, 5340))
    const label = useTransform(reveal, (value) => 0.78 + value * 0.22)
    const barsHeight = useTransform(bars, (value) => value * 72)
    const copyHeight = useTransform(reveal, (value) => value * 360)
    const fill0 = useTransform(props.time, (value) => envelope(value, STEPS[0].done, STEPS[0].done + 280))
    const fill1 = useTransform(props.time, (value) => envelope(value, STEPS[1].done, STEPS[1].done + 280))
    const fill2 = useTransform(props.time, (value) => envelope(value, STEPS[2].done, STEPS[2].done + 280))
    const fill3 = useTransform(props.time, (value) => envelope(value, STEPS[3].done, STEPS[3].done + 280))
    const fills = [fill0, fill1, fill2, fill3]

    if (!props.show) return null

    return (
        <div style={{ marginTop: 16 }}>
            <div
                style={{
                    position: "relative",
                    background: CARD,
                    border: `1px solid ${BORDER}`,
                    borderRadius: "var(--inner)",
                    padding: "12px 14px 13px",
                    overflow: "hidden",
                }}
            >
                <motion.div style={{ display: "flex", alignItems: "center", gap: 7, opacity: label }}>
                    <span style={{ color: props.accent, display: "grid", flex: "none" }}>
                        <SparkleIcon />
                    </span>
                    <span
                        style={{
                            fontSize: 12.5,
                            lineHeight: 1.3,
                            fontWeight: 600,
                            letterSpacing: "-0.011em",
                            color: TEXT,
                        }}
                    >
                        Recommended Focus
                    </span>
                </motion.div>

                <motion.div
                    aria-hidden="true"
                    style={{
                        overflow: "hidden",
                        maxHeight: barsHeight,
                        opacity: bars,
                    }}
                >
                    <div style={{ paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 5 }}>
                            {fills.map((fill, index) => (
                                <div
                                    key={STEPS[index].id}
                                    style={{
                                        height: 3,
                                        borderRadius: 99,
                                        background: "rgba(255,255,255,0.08)",
                                        overflow: "hidden",
                                    }}
                                >
                                    <motion.div
                                        style={{
                                            height: "100%",
                                            width: "100%",
                                            background: props.accent,
                                            scaleX: fill,
                                            transformOrigin: "left center",
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                        <div style={{ fontSize: 12, lineHeight: 1.4, color: MUTED }}>Stage, sector, and check size</div>
                    </div>
                </motion.div>

                <motion.div style={{ overflow: "hidden", maxHeight: copyHeight, opacity: reveal, y }}>
                    <div style={{ paddingTop: 8 }}>
                        <div
                            style={{
                                fontSize: "var(--rec)",
                                lineHeight: 1.5,
                                color: TEXT,
                            }}
                        >
                            Prioritize {props.stage}-stage investors actively backing B2B software companies with
                            check sizes between $500K and $1.5M.
                        </div>
                        <div
                            style={{
                                display: "inline-flex",
                                marginTop: 10,
                                padding: "3px 8px",
                                borderRadius: 999,
                                background: mix(props.accent, 0.14),
                                color: props.accent,
                                fontSize: 11,
                                lineHeight: 1.35,
                                fontWeight: 600,
                            }}
                        >
                            Personalized to your company
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    )
}

function StrategyHeader(props: { time: MotionValue<number>; accent: string }) {
    const [status, setStatus] = React.useState(() => readStatus(props.time.get()))

    useMotionValueEvent(props.time, "change", (value) => {
        const next = readStatus(value)
        setStatus((current) =>
            current.label === next.label && current.complete === next.complete ? current : next
        )
    })

    return (
        <div>
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                }}
            >
                <h2
                    style={{
                        margin: 0,
                        flex: "1 1 180px",
                        minWidth: 0,
                        fontSize: "var(--title)",
                        lineHeight: 1.25,
                        fontWeight: 600,
                        letterSpacing: "-0.02em",
                        color: TEXT,
                    }}
                >
                    Fundraising Strategy
                </h2>
                <div
                    aria-live="polite"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        maxWidth: "100%",
                        minHeight: 22,
                        paddingTop: 2,
                    }}
                >
                    <span
                        aria-hidden="true"
                        className={status.complete ? "vekta-sr-dot" : "vekta-sr-dot vekta-sr-dot-live"}
                        style={{ background: props.accent }}
                    />
                    <span style={{ fontSize: 12, lineHeight: 1.35, color: status.complete ? TEXT : MUTED }}>
                        {status.label}
                    </span>
                </div>
            </div>
        </div>
    )
}

/**
 * Animated fundraising strategy for the Vekta marketing site.
 *
 * @framerIntrinsicWidth 560
 * @framerIntrinsicHeight 640
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */
export default function StrategyRoadmap(props: Partial<StrategyRoadmapProps>) {
    const {
        accentColor = DEFAULTS.accentColor,
        backgroundColor = DEFAULTS.backgroundColor,
        raiseTarget = DEFAULTS.raiseTarget,
        fundingStage = DEFAULTS.fundingStage,
        investorTarget = DEFAULTS.investorTarget,
        animationSpeed = DEFAULTS.animationSpeed,
        autoPlay = DEFAULTS.autoPlay,
        showRecommendation = DEFAULTS.showRecommendation,
        borderRadius = DEFAULTS.borderRadius,
        style,
    } = props

    const [reduced, setReduced] = React.useState(prefersReducedMotion)
    const speedRef = React.useRef(1)
    speedRef.current = Math.min(2.5, Math.max(0.35, animationSpeed || 1))

    React.useEffect(() => {
        const query = window.matchMedia("(prefers-reduced-motion: reduce)")
        const onChange = () => setReduced(query.matches)
        query.addEventListener("change", onChange)
        return () => query.removeEventListener("change", onChange)
    }, [])

    // Export and the component thumbnail stay on the finished frame.
    // The canvas, preview, and published site keep the clock running.
    const playing = autoPlay && !reduced && !isFrozenTarget()
    const time = useStrategyClock(playing, speedRef)
    const stage = fundingStage.trim() || DEFAULTS.fundingStage
    const radius = Math.max(0, borderRadius)
    const innerRadius = Math.max(8, radius - 4)

    return (
        <div
            className="vekta-sr-frame"
            style={{
                width: "100%",
                height: "auto",
                ...style,
                minWidth: 0,
                boxSizing: "border-box",
            }}
        >
            <style>{STYLES}</style>
            <section
                className="vekta-sr"
                aria-label="Fundraising strategy"
                style={{
                    minHeight: "100%",
                    boxSizing: "border-box",
                    background: backgroundColor,
                    color: TEXT,
                    border: `1px solid ${BORDER}`,
                    borderRadius: radius,
                    padding: "var(--inset)",
                    fontFamily: FONT,
                    WebkitFontSmoothing: "antialiased",
                    overflow: "hidden",
                    ["--accent" as string]: accentColor,
                    ["--inner" as string]: `${innerRadius}px`,
                }}
            >
                <StrategyHeader time={time} accent={accentColor} />

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: 8,
                        marginTop: 14,
                    }}
                >
                    <Metric label="Raise target" value={raiseTarget} enter={160} time={time} />
                    <Metric label="Funding stage" value={stage} enter={340} time={time} />
                    <Metric label="Target investors" value={investorTarget} enter={520} time={time} />
                </div>

                <ol
                    aria-label="Fundraising roadmap"
                    style={{
                        listStyle: "none",
                        margin: "18px 0 0",
                        padding: 0,
                    }}
                >
                    {STEPS.map((step, index) => (
                        <Milestone
                            key={step.id}
                            time={time}
                            accent={accentColor}
                            surface={backgroundColor}
                            n={step.n}
                            title={step.title}
                            body={step.body}
                            show={step.show}
                            doneAt={step.done}
                            lineAt={step.line}
                            isLast={index === STEPS.length - 1}
                        />
                    ))}
                </ol>

                <Recommendation time={time} accent={accentColor} stage={stage} show={showRecommendation} />
            </section>
        </div>
    )
}

StrategyRoadmap.defaultProps = DEFAULTS
StrategyRoadmap.displayName = "Strategy Roadmap"

const STYLES = `
.vekta-sr-frame { container: vekta-sr / inline-size; }
.vekta-sr, .vekta-sr * { box-sizing: border-box; }
.vekta-sr {
  --node: 26px;
  --inset: 18px;
  --title: 15px;
  --step: 13.5px;
  --body: 12.5px;
  --rec: 13px;
  --metric: 16px;
  --step-gap: 18px;
}
.vekta-sr-num { font-size: 10px; }
.vekta-sr-dot {
  width: 6px;
  height: 6px;
  border-radius: 99px;
  flex: none;
}
.vekta-sr-dot-live {
  animation: vekta-sr-pulse 1.8s ease-in-out infinite;
}
@keyframes vekta-sr-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(0.7); opacity: 0.4; }
}
@container vekta-sr (max-width: 420px) {
  .vekta-sr {
    --node: 22px;
    --inset: 14px;
    --title: 14px;
    --step: 13px;
    --body: 12px;
    --rec: 12.5px;
    --metric: 14px;
    --step-gap: 14px;
  }
  .vekta-sr-num { font-size: 9px; }
}
@media (prefers-reduced-motion: reduce) {
  .vekta-sr-dot-live { animation: none; }
}
`

addPropertyControls(StrategyRoadmap, {
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
    raiseTarget: {
        type: ControlType.String,
        title: "Raise Target",
        defaultValue: DEFAULTS.raiseTarget,
    },
    fundingStage: {
        type: ControlType.String,
        title: "Funding Stage",
        defaultValue: DEFAULTS.fundingStage,
    },
    investorTarget: {
        type: ControlType.String,
        title: "Investor Target",
        defaultValue: DEFAULTS.investorTarget,
    },
    animationSpeed: {
        type: ControlType.Number,
        title: "Animation Speed",
        description: "1 plays the full sequence in 8 seconds.",
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
    showRecommendation: {
        type: ControlType.Boolean,
        title: "Show Recommendation",
        defaultValue: DEFAULTS.showRecommendation,
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
