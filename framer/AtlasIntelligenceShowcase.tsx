import * as React from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform, type MotionValue } from "framer-motion"

/**
 * Vekta — Atlas Intelligence Showcase
 *
 * Two product demonstrations on one timeline: investor fit on the left,
 * evidence-backed next move on the right. Plays once on enter, then holds.
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 620
 */

const DURATION = 6
const STACK_BELOW = 780
const FONT = `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

const CARD = "#151816"
const ELEVATED = "#1B1F1C"
const TEXT = "#F5F7F5"
const MUTED = "#929A94"
const CARD_BORDER = "rgba(255,255,255,0.10)"
const LINE = "rgba(255,255,255,0.08)"

/**
 * Shared timeline, in progress units over 6 seconds.
 * 0–0.5s viz, 0.5–2s scores and signals, 2–3.5s reasons and analysis,
 * 3.5–5s badge and recommendation, 5–6s hold.
 */
const PHASE = {
    viz: [0, 0.083],
    score: [0.083, 0.2],
    bars: [
        [0.14, 0.21],
        [0.18, 0.25],
        [0.22, 0.29],
        [0.26, 0.333],
    ],
    signals: [
        [0.1, 0.2],
        [0.2, 0.32],
    ],
    reasons: [
        [0.333, 0.43],
        [0.4, 0.5],
        [0.47, 0.57],
    ],
    analysis: [0.333, 0.46],
    badge: [0.583, 0.7],
    recommendation: [0.6, 0.78],
} as const

const REASONS = [
    "Invests at your stage in B2B software.",
    "Typical check size matches this round.",
    "Recently active with comparable companies.",
]

const DIMENSIONS = [
    { label: "Stage alignment", delta: 4 },
    { label: "Sector relevance", delta: 2 },
    { label: "Check size compatibility", delta: -4 },
    { label: "Geography alignment", delta: -2 },
]

interface ShowcaseProps {
    backgroundColor: string
    accentColor: string
    showDottedGrid: boolean
    showColumnDivider: boolean
    borderRadius: number
    autoPlay: boolean
    animationSpeed: number
    loop: boolean
    enableHoverEffects: boolean
    leftHeadline: string
    leftDescription: string
    rightHeadline: string
    rightDescription: string
    investorName: string
    investorFitScore: number
    recommendationTitle: string
    recommendationDescription: string
    columnGap: number
    visualizationHeight: number
    sectionPadding: number
    previewProgress?: number
    style?: React.CSSProperties
}

const DEFAULTS: ShowcaseProps = {
    backgroundColor: "#101110",
    accentColor: "#4ADE80",
    showDottedGrid: true,
    showColumnDivider: true,
    borderRadius: 16,
    autoPlay: true,
    animationSpeed: 1,
    loop: false,
    enableHoverEffects: true,
    leftHeadline: "Find the right investors. Know why they fit.",
    leftDescription:
        "Atlas identifies investors aligned with your stage, sector, and funding goals—backed by relevant data and clear reasoning.",
    rightHeadline: "Every insight. A clearer next move.",
    rightDescription:
        "Atlas turns company data, investor feedback, and fundraising activity into timely, actionable recommendations.",
    investorName: "North Ridge Ventures",
    investorFitScore: 92,
    recommendationTitle: "Re-engage interested investors with your latest growth.",
    recommendationDescription:
        "Recent revenue growth lines up with investors who have already reopened the round.",
    columnGap: 1,
    visualizationHeight: 430,
    sectionPadding: 0,
}

const CSS = `
.vekta-ais, .vekta-ais * {
  box-sizing: border-box;
  font-family: ${FONT} !important;
}
.vekta-ais {
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.vekta-ais-headline {
  margin: 0 !important;
  font-size: var(--headline) !important;
  line-height: 1.3 !important;
  font-weight: 600 !important;
  letter-spacing: -0.018em !important;
  color: ${TEXT} !important;
  overflow-wrap: break-word;
}
.vekta-ais-desc {
  margin: 8px 0 0 !important;
  font-size: var(--desc) !important;
  line-height: 1.5 !important;
  font-weight: 400 !important;
  letter-spacing: -0.006em !important;
  color: ${MUTED} !important;
  overflow-wrap: break-word;
}
.vekta-ais-copy { min-width: 0; }
.vekta-ais-headline-wrap { padding: var(--headline-pad); }
.vekta-ais-desc-wrap { padding: var(--desc-pad); }
.vekta-ais-dots {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(255,255,255,0.22) 0.7px, transparent 0.75px);
  background-size: 16px 16px;
  -webkit-mask-image: radial-gradient(ellipse at center, #000 42%, transparent 78%);
  mask-image: radial-gradient(ellipse at center, #000 42%, transparent 78%);
  pointer-events: none;
}
.vekta-ais-card {
  transition: border-color 180ms ease, background-color 180ms ease;
}
.vekta-ais[data-hover="on"] .vekta-ais-card:hover {
  border-color: rgba(255,255,255,0.18);
  background: #171c19;
}
@keyframes vekta-ais-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.82); }
}
.vekta-ais-dot[data-pulse="on"] { animation: vekta-ais-pulse 1.15s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .vekta-ais-card { transition: none; }
  .vekta-ais-dot { animation: none !important; }
}
`

function clamp01(value: number) {
    return Math.min(1, Math.max(0, value))
}

function clampScore(value: number) {
    return Math.max(0, Math.min(100, Math.round(value)))
}

function easeOut(value: number) {
    const t = clamp01(value)
    return 1 - Math.pow(1 - t, 3)
}

function reveal(progress: number, start: number, end: number) {
    if (progress <= start) return 0
    if (progress >= end) return 1
    return easeOut((progress - start) / (end - start))
}

function prefersReducedMotion() {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function renderTarget() {
    try {
        return RenderTarget.current()
    } catch {
        return RenderTarget.preview
    }
}

function isStaticTarget() {
    const target = renderTarget()
    return target === RenderTarget.canvas || target === RenderTarget.thumbnail || target === RenderTarget.export
}

function useClock(
    active: boolean,
    holdComplete: boolean,
    speedRef: React.MutableRefObject<number>,
    loopRef: React.MutableRefObject<boolean>
) {
    const progress = useMotionValue(holdComplete ? 1 : 0)

    React.useLayoutEffect(() => {
        if (holdComplete) progress.set(1)
        else if (!active) progress.set(0)
    }, [active, holdComplete, progress])

    React.useEffect(() => {
        if (!active) return
        let alive = true
        let current: { stop: () => void } | null = null
        const run = () => {
            progress.set(0)
            current = animate(progress, 1, {
                duration: DURATION / Math.min(2, Math.max(0.5, speedRef.current || 1)),
                ease: "linear",
                onComplete: () => {
                    if (alive && loopRef.current) run()
                },
            })
        }
        run()
        return () => {
            alive = false
            current?.stop()
        }
    }, [active, progress, speedRef, loopRef])

    return progress
}

function Icon({ name, size = 15 }: { name: "trend" | "users" | "check" | "spark"; size?: number }) {
    const pen = {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.75,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        "aria-hidden": true as const,
    }
    if (name === "trend") {
        return (
            <svg {...pen}>
                <path d="M22 7 13.5 15.5l-5-5L2 17" />
                <path d="M16 7h6v6" />
            </svg>
        )
    }
    if (name === "users") {
        return (
            <svg {...pen}>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
        )
    }
    if (name === "spark") {
        return (
            <svg {...pen}>
                <path d="M12 3v4" />
                <path d="M12 17v4" />
                <path d="M3 12h4" />
                <path d="M17 12h4" />
                <path d="m6 6 2.2 2.2" />
                <path d="m15.8 15.8 2.2 2.2" />
                <path d="m18 6-2.2 2.2" />
                <path d="m8.2 15.8-2.2 2.2" />
            </svg>
        )
    }
    return (
        <svg {...pen}>
            <path d="M20 6 9 17l-5-5" />
        </svg>
    )
}

function Fade(props: {
    clock: MotionValue<number>
    start: number
    end: number
    y?: number
    style?: React.CSSProperties
    children: React.ReactNode
}) {
    const opacity = useTransform(props.clock, (value) => reveal(value, props.start, props.end))
    const shift = useTransform(props.clock, (value) => (1 - reveal(value, props.start, props.end)) * (props.y ?? 0))
    return (
        <motion.div style={{ ...props.style, opacity, y: shift }}>{props.children}</motion.div>
    )
}

function MotionText({ value }: { value: MotionValue<string> }) {
    const [text, setText] = React.useState(() => value.get())
    useMotionValueEvent(value, "change", (next) => {
        setText((current) => (current === next ? current : next))
    })
    return <>{text}</>
}

function FitBar(props: { clock: MotionValue<number>; start: number; end: number; amount: number }) {
    const scale = useTransform(props.clock, (value) => reveal(value, props.start, props.end) * props.amount)
    return (
        <div style={{ height: 3, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
            <motion.div
                style={{
                    height: "100%",
                    width: "100%",
                    borderRadius: 99,
                    background: "var(--accent)",
                    scaleX: scale,
                    transformOrigin: "0% 50%",
                }}
            />
        </div>
    )
}

function ProductCard(props: { radius: number; narrow: boolean; children: React.ReactNode }) {
    return (
        <div
            className="vekta-ais-card"
            style={{
                width: "100%",
                background: CARD,
                border: `1px solid ${CARD_BORDER}`,
                borderRadius: Math.max(0, props.radius),
                padding: props.narrow ? "14px 14px 12px" : "16px 16px 14px",
                display: "flex",
                flexDirection: "column",
                gap: props.narrow ? 10 : 12,
            }}
        >
            {props.children}
        </div>
    )
}

function CardHeader(props: { title: string; badge: React.ReactNode }) {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: "var(--accent)", flex: "0 0 auto" }} />
                <h3
                    style={{
                        margin: 0,
                        fontSize: 14,
                        lineHeight: "20px",
                        fontWeight: 600,
                        letterSpacing: "-0.011em",
                        color: TEXT,
                        overflowWrap: "break-word",
                    }}
                >
                    {props.title}
                </h3>
            </div>
            {props.badge}
        </div>
    )
}

function ExampleMark() {
    return (
        <span
            style={{
                flex: "0 0 auto",
                fontSize: 10,
                lineHeight: "14px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: MUTED,
            }}
        >
            Example
        </span>
    )
}

const badgeChrome: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 22,
    padding: "0 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.01em",
    lineHeight: "22px",
    whiteSpace: "nowrap",
    flex: "0 0 auto",
}

function InvestorTargetingCard(props: {
    clock: MotionValue<number>
    investorName: string
    score: number
    radius: number
    narrow: boolean
}) {
    const scoreText = useTransform(props.clock, (value) => `${Math.round(reveal(value, PHASE.score[0], PHASE.score[1]) * props.score)}`)
    const badgeOpacity = useTransform(props.clock, (value) => reveal(value, PHASE.badge[0], PHASE.badge[1]))

    return (
        <ProductCard radius={props.radius} narrow={props.narrow}>
            <CardHeader
                title="Investor Fit Analysis"
                badge={
                    <motion.span
                        style={{
                            ...badgeChrome,
                            opacity: badgeOpacity,
                            background: "color-mix(in srgb, var(--accent) 16%, transparent)",
                            color: "var(--accent)",
                        }}
                    >
                        Strong Fit
                    </motion.span>
                }
            />
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
                <div
                    style={{
                        fontSize: props.narrow ? 15 : 16,
                        lineHeight: "22px",
                        fontWeight: 600,
                        letterSpacing: "-0.015em",
                        color: TEXT,
                        overflowWrap: "anywhere",
                        minWidth: 0,
                    }}
                >
                    {props.investorName}
                </div>
                <ExampleMark />
            </div>
            <Fade clock={props.clock} start={PHASE.score[0]} end={PHASE.score[0] + 0.04} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: props.narrow ? 22 : 24, lineHeight: "28px", fontWeight: 600, letterSpacing: "-0.03em", color: TEXT }}>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                            <MotionText value={scoreText} />
                        </span>
                        <span style={{ fontSize: "0.62em", fontWeight: 500, color: MUTED, marginLeft: 1 }}>%</span>
                    </div>
                    <span style={{ fontSize: 12, lineHeight: "16px", color: MUTED }}>Investor fit</span>
                </div>
                <FitBar clock={props.clock} start={PHASE.score[0]} end={PHASE.score[1]} amount={props.score / 100} />
            </Fade>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {DIMENSIONS.map((dimension, index) => {
                    const value = clampScore(props.score + dimension.delta)
                    const [start, end] = PHASE.bars[index]
                    return (
                        <Fade key={dimension.label} clock={props.clock} start={start} end={start + 0.035} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                                <span style={{ fontSize: 12, lineHeight: "16px", color: MUTED }}>{dimension.label}</span>
                                <span style={{ fontSize: 12, lineHeight: "16px", fontWeight: 600, color: TEXT, fontVariantNumeric: "tabular-nums" }}>{value}</span>
                            </div>
                            <FitBar clock={props.clock} start={start} end={end} amount={value / 100} />
                        </Fade>
                    )
                })}
            </div>
            <div style={{ height: 1, background: LINE }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <div style={{ fontSize: 11, lineHeight: "14px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTED }}>
                    Why this fit
                </div>
                {REASONS.map((reason, index) => (
                    <Fade key={reason} clock={props.clock} start={PHASE.reasons[index][0]} end={PHASE.reasons[index][1]} y={6}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                            <span
                                aria-hidden
                                style={{
                                    width: 16,
                                    height: 16,
                                    marginTop: 1,
                                    borderRadius: 99,
                                    background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                                    color: "var(--accent)",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flex: "0 0 auto",
                                }}
                            >
                                <Icon name="check" size={11} />
                            </span>
                            <span style={{ fontSize: 13, lineHeight: "18px", color: TEXT, overflowWrap: "break-word" }}>{reason}</span>
                        </div>
                    </Fade>
                ))}
            </div>
        </ProductCard>
    )
}

function SignalRow(props: {
    icon: "trend" | "users"
    title: string
    detail: string
    value: string
}) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 10,
                background: ELEVATED,
                border: `1px solid ${LINE}`,
                minWidth: 0,
            }}
        >
            <span
                aria-hidden
                style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                    color: "var(--accent)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: "0 0 auto",
                }}
            >
                <Icon name={props.icon} size={14} />
            </span>
            <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 13, lineHeight: "18px", fontWeight: 600, letterSpacing: "-0.011em", color: TEXT }}>{props.title}</span>
                <span style={{ fontSize: 12, lineHeight: "16px", color: MUTED }}>{props.detail}</span>
            </span>
            <span
                style={{
                    marginLeft: "auto",
                    fontSize: 13,
                    lineHeight: "18px",
                    fontWeight: 600,
                    color: TEXT,
                    fontVariantNumeric: "tabular-nums",
                    flex: "0 0 auto",
                }}
            >
                {props.value}
            </span>
        </div>
    )
}

function EvidenceBackedRecommendationCard(props: {
    clock: MotionValue<number>
    title: string
    description: string
    radius: number
    narrow: boolean
    pulsing: boolean
}) {
    return (
        <ProductCard radius={props.radius} narrow={props.narrow}>
            <CardHeader
                title="Atlas Intelligence"
                badge={
                    <span style={{ ...badgeChrome, background: "rgba(255,255,255,0.06)", color: TEXT, border: `1px solid ${LINE}` }}>
                        New Insight
                    </span>
                }
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12, lineHeight: "16px", color: MUTED }}>Company and investor signals</span>
                <ExampleMark />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Fade clock={props.clock} start={PHASE.signals[0][0]} end={PHASE.signals[0][1]} y={6}>
                    <SignalRow icon="trend" title="Revenue growth" detail="Quarter over quarter" value="+38%" />
                </Fade>
                <Fade clock={props.clock} start={PHASE.signals[1][0]} end={PHASE.signals[1][1]} y={6}>
                    <SignalRow icon="users" title="Investor interest" detail="Reopened your round" value="4 firms" />
                </Fade>
                <Fade clock={props.clock} start={PHASE.analysis[0]} end={PHASE.analysis[1]} y={6}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 10px",
                            borderRadius: 10,
                            background: ELEVATED,
                            border: `1px solid ${LINE}`,
                            minWidth: 0,
                        }}
                    >
                        <span
                            className="vekta-ais-dot"
                            data-pulse={props.pulsing ? "on" : "off"}
                            aria-hidden
                            style={{
                                width: 7,
                                height: 7,
                                marginLeft: 10,
                                marginRight: 4,
                                borderRadius: 99,
                                background: "var(--accent)",
                                flex: "0 0 auto",
                            }}
                        />
                        <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                            <span style={{ fontSize: 13, lineHeight: "18px", fontWeight: 600, letterSpacing: "-0.011em", color: TEXT }}>
                                Analysis
                            </span>
                            <span style={{ fontSize: 12, lineHeight: "16px", color: MUTED, overflowWrap: "break-word" }}>
                                Comparing company data with investor activity
                            </span>
                        </span>
                    </div>
                </Fade>
            </div>
            <Fade clock={props.clock} start={PHASE.recommendation[0]} end={PHASE.recommendation[1]} y={8}>
                <div
                    style={{
                        borderRadius: 12,
                        padding: "12px 12px 11px",
                        background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--accent) 38%, transparent)",
                        boxShadow: "inset 2px 0 0 var(--accent)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        minWidth: 0,
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--accent)" }}>
                        <Icon name="spark" size={12} />
                        <span style={{ fontSize: 11, lineHeight: "14px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                            Recommended next move
                        </span>
                    </div>
                    <div
                        style={{
                            fontSize: props.narrow ? 14 : 15,
                            lineHeight: "21px",
                            fontWeight: 600,
                            letterSpacing: "-0.015em",
                            color: TEXT,
                            overflowWrap: "break-word",
                        }}
                    >
                        {props.title}
                    </div>
                    <div style={{ fontSize: 12.5, lineHeight: "18px", color: MUTED, overflowWrap: "break-word" }}>{props.description}</div>
                </div>
            </Fade>
        </ProductCard>
    )
}

function Visualization(props: {
    opacity: MotionValue<number>
    shift: MotionValue<number>
    height: number | string
    minHeight: number
    narrow: boolean
    showDots: boolean
    dividerTop: boolean
    children: React.ReactNode
}) {
    return (
        <div
            className="vekta-ais-viz"
            data-viz="true"
            style={{
                position: "relative",
                width: "100%",
                height: props.height,
                minHeight: props.minHeight,
                minWidth: 0,
                overflow: "hidden",
                borderTop: props.dividerTop ? `1px solid ${LINE}` : undefined,
            }}
        >
            <motion.div
                style={{
                    opacity: props.opacity,
                    y: props.shift,
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: props.narrow ? 14 : 20,
                }}
            >
                {props.showDots ? <div className="vekta-ais-dots" aria-hidden /> : null}
                <div style={{ width: "100%", maxWidth: 400, position: "relative" }}>{props.children}</div>
            </motion.div>
        </div>
    )
}

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 620
 */
export default function AtlasIntelligenceShowcase(props: Partial<ShowcaseProps>) {
    const {
        backgroundColor = DEFAULTS.backgroundColor,
        accentColor = DEFAULTS.accentColor,
        showDottedGrid = DEFAULTS.showDottedGrid,
        showColumnDivider = DEFAULTS.showColumnDivider,
        borderRadius = DEFAULTS.borderRadius,
        autoPlay = DEFAULTS.autoPlay,
        animationSpeed = DEFAULTS.animationSpeed,
        loop = DEFAULTS.loop,
        enableHoverEffects = DEFAULTS.enableHoverEffects,
        leftHeadline = DEFAULTS.leftHeadline,
        leftDescription = DEFAULTS.leftDescription,
        rightHeadline = DEFAULTS.rightHeadline,
        rightDescription = DEFAULTS.rightDescription,
        investorName = DEFAULTS.investorName,
        investorFitScore = DEFAULTS.investorFitScore,
        recommendationTitle = DEFAULTS.recommendationTitle,
        recommendationDescription = DEFAULTS.recommendationDescription,
        columnGap = DEFAULTS.columnGap,
        visualizationHeight = DEFAULTS.visualizationHeight,
        sectionPadding = DEFAULTS.sectionPadding,
        previewProgress,
        style,
    } = props

    const rootRef = React.useRef<HTMLElement>(null)
    const [stacked, setStacked] = React.useState(false)
    const [narrow, setNarrow] = React.useState(false)
    const [entered, setEntered] = React.useState(false)
    const [reduced, setReduced] = React.useState(prefersReducedMotion)
    const [pulsing, setPulsing] = React.useState(false)
    const pulseRef = React.useRef(false)
    const speedRef = React.useRef(1)
    const loopRef = React.useRef(false)
    speedRef.current = animationSpeed || 1
    loopRef.current = loop

    const scrubbing = typeof previewProgress === "number"
    const staticFrame = scrubbing || reduced || !autoPlay || isStaticTarget()
    const playing = entered && !staticFrame
    const progress = useClock(playing, staticFrame, speedRef, loopRef)
    const scrub = useMotionValue(clamp01(previewProgress ?? 1))

    React.useLayoutEffect(() => {
        if (scrubbing) scrub.set(clamp01(previewProgress as number))
    }, [previewProgress, scrub, scrubbing])

    const clock = scrubbing ? scrub : progress
    const vizOpacity = useTransform(clock, (value) => reveal(value, PHASE.viz[0], PHASE.viz[1]))
    const vizShift = useTransform(clock, (value) => (1 - reveal(value, PHASE.viz[0], PHASE.viz[1])) * 8)

    useMotionValueEvent(clock, "change", (value) => {
        const next = value >= PHASE.analysis[0] && value < PHASE.badge[0] && !staticFrame
        if (next !== pulseRef.current) {
            pulseRef.current = next
            setPulsing(next)
        }
    })

    React.useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
        const query = window.matchMedia("(prefers-reduced-motion: reduce)")
        const onChange = () => setReduced(query.matches)
        onChange()
        query.addEventListener("change", onChange)
        return () => query.removeEventListener("change", onChange)
    }, [])

    React.useLayoutEffect(() => {
        const element = rootRef.current
        if (!element) return
        const measure = (width: number) => {
            if (width <= 0) return
            const nextStacked = width < STACK_BELOW
            const nextNarrow = width < 480
            setStacked((current) => (current === nextStacked ? current : nextStacked))
            setNarrow((current) => (current === nextNarrow ? current : nextNarrow))
        }
        measure(element.clientWidth)
        if (typeof ResizeObserver === "undefined") return
        const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width))
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    React.useEffect(() => {
        if (staticFrame) {
            setEntered(true)
            return
        }
        const element = rootRef.current
        if (!element || typeof IntersectionObserver === "undefined") {
            setEntered(true)
            return
        }
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setEntered(true)
                    observer.disconnect()
                }
            },
            { threshold: 0.2 }
        )
        observer.observe(element)
        return () => observer.disconnect()
    }, [staticFrame])

    const score = clampScore(investorFitScore)
    const vizHeight = Math.max(320, visualizationHeight)
    const gap = Math.max(0, Math.min(2, columnGap))
    const pad = Math.max(0, sectionPadding)
    const showDivider = showColumnDivider
    const rightColumn = stacked ? 1 : showDivider ? 3 : 2
    const explicitHeight = style?.height != null && style.height !== "auto" && style.height !== "100%"

    const leftCard = (
        <InvestorTargetingCard clock={clock} investorName={investorName} score={score} radius={borderRadius} narrow={narrow} />
    )
    const rightCard = (
        <EvidenceBackedRecommendationCard
            clock={clock}
            title={recommendationTitle}
            description={recommendationDescription}
            radius={borderRadius}
            narrow={narrow}
            pulsing={pulsing}
        />
    )

    return (
        <section
            ref={rootRef}
            className="vekta-ais"
            aria-label="Atlas intelligence"
            data-hover={enableHoverEffects ? "on" : "off"}
            data-layout={stacked ? "stacked" : "columns"}
            style={{
                ...style,
                width: style?.width ?? "100%",
                height: style?.height ?? "100%",
                minHeight: explicitHeight ? style?.minHeight : "min-content",
                position: style?.position ?? "relative",
                transform: style?.transform,
                boxSizing: "border-box",
                minWidth: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                background: backgroundColor,
                color: TEXT,
                fontFamily: FONT,
                ["--accent" as string]: accentColor,
                ["--headline" as string]: narrow ? "20px" : "21px",
                ["--desc" as string]: "14.5px",
                ["--headline-pad" as string]: narrow ? "20px 20px 0" : "22px 28px 0",
                ["--desc-pad" as string]: narrow ? "0 20px 16px" : "0 28px 12px",
            }}
        >
            <style>{CSS}</style>
            <div
                style={{
                    flex: "1 1 auto",
                    width: "100%",
                    minWidth: 0,
                    minHeight: 0,
                    display: "grid",
                    gridTemplateColumns: stacked
                        ? "minmax(0, 1fr)"
                        : showDivider
                          ? `minmax(0, 1fr) ${Math.max(gap, 1)}px minmax(0, 1fr)`
                          : "minmax(0, 1fr) minmax(0, 1fr)",
                    gridTemplateRows: stacked ? "auto auto auto auto auto auto" : `minmax(${vizHeight}px, 1fr) auto auto`,
                    columnGap: stacked || showDivider ? 0 : gap,
                    padding: pad,
                }}
            >
                <div style={{ gridColumn: 1, gridRow: 1, minWidth: 0 }}>
                    <Visualization
                        opacity={vizOpacity}
                        shift={vizShift}
                        height={stacked ? vizHeight : "100%"}
                        minHeight={vizHeight}
                        narrow={narrow}
                        showDots={showDottedGrid}
                        dividerTop={false}
                    >
                        {leftCard}
                    </Visualization>
                </div>
                {!stacked && showDivider ? (
                    <div aria-hidden style={{ gridColumn: 2, gridRow: "1 / -1", display: "flex", justifyContent: "center" }}>
                        <div style={{ width: 1, height: "100%", background: LINE }} />
                    </div>
                ) : null}
                <div className="vekta-ais-copy vekta-ais-headline-wrap" style={{ gridColumn: 1, gridRow: stacked ? 2 : 2 }}>
                    <h2 className="vekta-ais-headline">{leftHeadline}</h2>
                </div>
                <div className="vekta-ais-copy vekta-ais-desc-wrap" style={{ gridColumn: 1, gridRow: stacked ? 3 : 3 }}>
                    <p className="vekta-ais-desc">{leftDescription}</p>
                </div>
                <div style={{ gridColumn: rightColumn, gridRow: stacked ? 4 : 1, minWidth: 0 }}>
                    <Visualization
                        opacity={vizOpacity}
                        shift={vizShift}
                        height={stacked ? vizHeight : "100%"}
                        minHeight={vizHeight}
                        narrow={narrow}
                        showDots={showDottedGrid}
                        dividerTop={stacked && showDivider}
                    >
                        {rightCard}
                    </Visualization>
                </div>
                <div className="vekta-ais-copy vekta-ais-headline-wrap" style={{ gridColumn: rightColumn, gridRow: stacked ? 5 : 2 }}>
                    <h2 className="vekta-ais-headline">{rightHeadline}</h2>
                </div>
                <div className="vekta-ais-copy vekta-ais-desc-wrap" style={{ gridColumn: rightColumn, gridRow: stacked ? 6 : 3 }}>
                    <p className="vekta-ais-desc">{rightDescription}</p>
                </div>
            </div>
        </section>
    )
}

AtlasIntelligenceShowcase.defaultProps = DEFAULTS
AtlasIntelligenceShowcase.displayName = "Atlas Intelligence Showcase"

addPropertyControls(AtlasIntelligenceShowcase, {
    backgroundColor: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: DEFAULTS.backgroundColor,
    },
    accentColor: {
        type: ControlType.Color,
        title: "Accent Color",
        defaultValue: DEFAULTS.accentColor,
    },
    showDottedGrid: {
        type: ControlType.Boolean,
        title: "Dotted Grid",
        defaultValue: DEFAULTS.showDottedGrid,
        enabledTitle: "Show",
        disabledTitle: "Hide",
    },
    showColumnDivider: {
        type: ControlType.Boolean,
        title: "Column Divider",
        defaultValue: DEFAULTS.showColumnDivider,
        enabledTitle: "Show",
        disabledTitle: "Hide",
    },
    borderRadius: {
        type: ControlType.Number,
        title: "Border Radius",
        defaultValue: DEFAULTS.borderRadius,
        min: 0,
        max: 28,
        step: 1,
    },
    autoPlay: {
        type: ControlType.Boolean,
        title: "Auto Play",
        defaultValue: DEFAULTS.autoPlay,
        enabledTitle: "On",
        disabledTitle: "Off",
    },
    animationSpeed: {
        type: ControlType.Number,
        title: "Animation Speed",
        description: "1 plays the sequence in 6 seconds.",
        defaultValue: DEFAULTS.animationSpeed,
        min: 0.5,
        max: 2,
        step: 0.1,
    },
    loop: {
        type: ControlType.Boolean,
        title: "Loop",
        defaultValue: DEFAULTS.loop,
        enabledTitle: "Loop",
        disabledTitle: "Once",
    },
    enableHoverEffects: {
        type: ControlType.Boolean,
        title: "Hover Effects",
        defaultValue: DEFAULTS.enableHoverEffects,
        enabledTitle: "On",
        disabledTitle: "Off",
    },
    leftHeadline: {
        type: ControlType.String,
        title: "Left Headline",
        defaultValue: DEFAULTS.leftHeadline,
        displayTextArea: true,
    },
    leftDescription: {
        type: ControlType.String,
        title: "Left Description",
        defaultValue: DEFAULTS.leftDescription,
        displayTextArea: true,
    },
    rightHeadline: {
        type: ControlType.String,
        title: "Right Headline",
        defaultValue: DEFAULTS.rightHeadline,
        displayTextArea: true,
    },
    rightDescription: {
        type: ControlType.String,
        title: "Right Description",
        defaultValue: DEFAULTS.rightDescription,
        displayTextArea: true,
    },
    investorName: {
        type: ControlType.String,
        title: "Investor Name",
        defaultValue: DEFAULTS.investorName,
    },
    investorFitScore: {
        type: ControlType.Number,
        title: "Fit Score",
        defaultValue: DEFAULTS.investorFitScore,
        min: 0,
        max: 100,
        step: 1,
    },
    recommendationTitle: {
        type: ControlType.String,
        title: "Recommendation",
        defaultValue: DEFAULTS.recommendationTitle,
        displayTextArea: true,
    },
    recommendationDescription: {
        type: ControlType.String,
        title: "Recommendation Detail",
        defaultValue: DEFAULTS.recommendationDescription,
        displayTextArea: true,
    },
    columnGap: {
        type: ControlType.Number,
        title: "Column Gap",
        defaultValue: DEFAULTS.columnGap,
        min: 0,
        max: 2,
        step: 1,
    },
    visualizationHeight: {
        type: ControlType.Number,
        title: "Viz Height",
        defaultValue: DEFAULTS.visualizationHeight,
        min: 320,
        max: 560,
        step: 10,
    },
    sectionPadding: {
        type: ControlType.Number,
        title: "Section Padding",
        defaultValue: DEFAULTS.sectionPadding,
        min: 0,
        max: 48,
        step: 1,
    },
})
