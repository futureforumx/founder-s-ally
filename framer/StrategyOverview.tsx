import * as React from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform, type MotionValue } from "framer-motion"

/**
 * Vekta — Strategy Overview
 *
 * Hero preview of a generated fundraising strategy. Plays once when it
 * enters the viewport, then stays on the completed dashboard.
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 620
 * @framerIntrinsicHeight 520
 */

const DURATION = 8
const FONT = `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

const LIGHT = {
    text: "#111111",
    muted: "#737373",
    surface: "#F4F4F5",
    border: "#E5E5E5",
    divider: "#EAEAEA",
    badgeText: "#166534",
    hover: "#F3F4F3",
    iconHover: "#DCFCE7",
    wash: "rgba(22, 163, 74, 0.09)",
}

const DARK = {
    text: "#F5F7F5",
    muted: "#929A94",
    surface: "#191C1A",
    border: "rgba(255,255,255,0.09)",
    divider: "rgba(255,255,255,0.08)",
    badgeText: "#4ADE80",
    hover: "rgba(255,255,255,0.045)",
    iconHover: "rgba(74,222,128,0.14)",
    wash: "rgba(74, 222, 128, 0.10)",
}

type IconName = "sparkles" | "check" | "checkCircle" | "target" | "file" | "send" | "arrow"

interface AmountParts {
    prefix: string
    value: number
    suffix: string
    decimals: number
}

interface StrategyOverviewProps {
    theme: "light" | "dark"
    accentColor: string
    backgroundColor: string
    borderRadius: number
    showBorder: boolean
    productName: string
    subtitle: string
    statusLabel: string
    raiseTarget: string
    fundingStage: string
    strategyStatus: string
    recommendationHeading: string
    recommendationDescription: string
    aiBadgeText: string
    showVerification: boolean
    action1Title: string
    action1Description: string
    action1Link: string
    action2Title: string
    action2Description: string
    action2Link: string
    action3Title: string
    action3Description: string
    action3Link: string
    autoPlay: boolean
    animationSpeed: number
    loopAnimation: boolean
    enableHoverEffects: boolean
    previewProgress?: number
    style?: React.CSSProperties
}

const DEFAULTS: StrategyOverviewProps = {
    theme: "light",
    accentColor: "#16A34A",
    backgroundColor: "#FAFAFA",
    borderRadius: 18,
    showBorder: true,
    productName: "Atlas",
    subtitle: "Illustrative product preview",
    statusLabel: "Active",
    raiseTarget: "$2.5M",
    fundingStage: "Seed",
    strategyStatus: "Active",
    recommendationHeading: "Recommended fundraising approach",
    recommendationDescription:
        "Prioritize Seed-stage B2B SaaS investors with demonstrated interest in AI infrastructure and comparable companies.",
    aiBadgeText: "AI-generated",
    showVerification: true,
    action1Title: "Build your lead investor shortlist",
    action1Description: "Prioritize firms with relevant check sizes and sector focus",
    action1Link: "",
    action2Title: "Strengthen your fundraising narrative",
    action2Description: "Make your traction and capital milestones clearer",
    action2Link: "",
    action3Title: "Prepare targeted investor outreach",
    action3Description: "Tailor your positioning to your highest-fit investors",
    action3Link: "",
    autoPlay: true,
    animationSpeed: 1,
    loopAnimation: false,
    enableHoverEffects: true,
}

const ACTIONS: { icon: IconName; title: keyof StrategyOverviewProps; body: keyof StrategyOverviewProps; link: keyof StrategyOverviewProps }[] = [
    { icon: "target", title: "action1Title", body: "action1Description", link: "action1Link" },
    { icon: "file", title: "action2Title", body: "action2Description", link: "action2Link" },
    { icon: "send", title: "action3Title", body: "action3Description", link: "action3Link" },
]

const CSS = `
.vekta-so, .vekta-so * { box-sizing: border-box; font-family: ${FONT}; }
.vekta-so { -webkit-font-smoothing: antialiased; }
.vekta-so-row { border-radius: 12px; transition: background-color 160ms ease; }
.vekta-so-icon, .vekta-so-arrow { transition: transform 160ms ease, background-color 160ms ease, color 160ms ease; }
.vekta-so[data-hover="on"] .vekta-so-row:hover { background: var(--hover); }
.vekta-so[data-hover="on"] .vekta-so-row:hover .vekta-so-arrow { transform: translate(2px, -2px); color: var(--accent); }
.vekta-so[data-hover="on"] .vekta-so-row:hover .vekta-so-icon { background: var(--icon-hover); color: var(--accent); }
.vekta-so a { color: inherit; text-decoration: none; }
.vekta-so a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 12px; }
@media (prefers-reduced-motion: reduce) {
  .vekta-so-row, .vekta-so-icon, .vekta-so-arrow { transition: none; }
}
`

function clamp01(value: number) {
    return Math.min(1, Math.max(0, value))
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

function parseAmount(raw: string): AmountParts | null {
    const match = raw.trim().match(/^([^0-9]*?)([0-9][0-9,]*(?:\.[0-9]+)?)(.*)$/)
    if (!match) return null
    const numeric = match[2].replace(/,/g, "")
    const value = Number(numeric)
    if (!Number.isFinite(value)) return null
    return {
        prefix: match[1],
        value,
        suffix: match[3],
        decimals: (numeric.split(".")[1] || "").length,
    }
}

function formatAmount(parts: AmountParts, amount: number) {
    return `${parts.prefix}${amount.toFixed(parts.decimals)}${parts.suffix}`
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

function resolveAccent(theme: "light" | "dark", accent: string) {
    if (theme === "dark" && accent.toLowerCase() === "#16a34a") return "#4ADE80"
    if (theme === "light" && accent.toLowerCase() === "#4ade80") return "#16A34A"
    return accent
}

function resolveBackground(theme: "light" | "dark", background: string) {
    const value = background.trim()
    if (theme === "dark" && (!value || value.toLowerCase() === "#fafafa")) return "#101110"
    if (theme === "light" && value.toLowerCase() === "#101110") return "#FAFAFA"
    return value || "#FAFAFA"
}

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
    const pen = {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.75,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        "aria-hidden": true,
    }
    if (name === "sparkles") {
        return (
            <svg {...pen}>
                <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                <path d="M20 3v4" />
                <path d="M22 5h-4" />
                <path d="M4 17v2" />
                <path d="M5 18H3" />
            </svg>
        )
    }
    if (name === "check") {
        return (
            <svg {...pen}>
                <path d="M20 6 9 17l-5-5" />
            </svg>
        )
    }
    if (name === "checkCircle") {
        return (
            <svg {...pen}>
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
            </svg>
        )
    }
    if (name === "target") {
        return (
            <svg {...pen}>
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
            </svg>
        )
    }
    if (name === "file") {
        return (
            <svg {...pen}>
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                <path d="M10 9H8" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
            </svg>
        )
    }
    if (name === "send") {
        return (
            <svg {...pen}>
                <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
                <path d="m21.854 2.147-10.94 10.939" />
            </svg>
        )
    }
    return (
        <svg {...pen}>
            <path d="M7 7h10v10" />
            <path d="M7 17 17 7" />
        </svg>
    )
}

function Reveal(props: {
    progress: MotionValue<number>
    start: number
    end: number
    y?: number
    style?: React.CSSProperties
    children: React.ReactNode
}) {
    const opacity = useTransform(props.progress, (value) => reveal(value, props.start, props.end))
    const shift = useTransform(opacity, (value) => (1 - value) * (props.y ?? 0))
    return (
        <motion.div style={{ opacity, y: shift, ...props.style }}>{props.children}</motion.div>
    )
}

function StatusBadge(props: { progress: MotionValue<number>; label: string; background: string; color: string }) {
    return (
        <Reveal progress={props.progress} start={0.06} end={0.14} y={4} style={{ flex: "none" }}>
            <span
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 9px 4px 7px",
                    borderRadius: 999,
                    background: props.background,
                    color: props.color,
                    fontSize: 12,
                    lineHeight: 1,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                }}
            >
                <Icon name="check" size={12} />
                {props.label}
            </span>
        </Reveal>
    )
}

function MetricValue(props: { progress: MotionValue<number>; text: string; start: number; end: number }) {
    const ref = React.useRef<HTMLSpanElement>(null)
    const parts = React.useMemo(() => parseAmount(props.text), [props.text])

    const paint = React.useCallback(
        (progress: number) => {
            const node = ref.current
            if (!node) return
            if (!parts) {
                node.textContent = props.text
                return
            }
            const t = reveal(progress, props.start, props.end)
            node.textContent = formatAmount(parts, parts.value * t)
        },
        [parts, props.end, props.start, props.text]
    )

    useMotionValueEvent(props.progress, "change", paint)
    React.useLayoutEffect(() => {
        paint(props.progress.get())
    }, [paint, props.progress])

    return (
        <span
            ref={ref}
            style={{
                display: "block",
                marginTop: 4,
                fontSize: "var(--metric)",
                lineHeight: 1.1,
                fontWeight: 600,
                letterSpacing: "-0.035em",
                fontVariantNumeric: "tabular-nums",
                color: "var(--text)",
            }}
        />
    )
}

function Metric(props: {
    progress: MotionValue<number>
    label: string
    value: string
    fadeStart: number
    fadeEnd: number
    count?: boolean
}) {
    return (
        <Reveal progress={props.progress} start={props.fadeStart} end={props.fadeEnd} y={8} style={{ minWidth: 0 }}>
            <div style={{ fontSize: "var(--label)", lineHeight: 1.3, color: "var(--muted)" }}>{props.label}</div>
            {props.count ? (
                <MetricValue progress={props.progress} text={props.value} start={props.fadeStart} end={props.fadeEnd + 0.08} />
            ) : (
                <div
                    style={{
                        marginTop: 4,
                        fontSize: "var(--metric)",
                        lineHeight: 1.1,
                        fontWeight: 600,
                        letterSpacing: "-0.035em",
                        color: "var(--text)",
                        overflowWrap: "break-word",
                    }}
                >
                    {props.value}
                </div>
            )}
        </Reveal>
    )
}

function ActionRow(props: {
    progress: MotionValue<number>
    start: number
    icon: IconName
    title: string
    description: string
    href?: string
    last: boolean
    divider: string
}) {
    const body = (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 8px", minWidth: 0 }}>
            <span
                className="vekta-so-icon"
                style={{
                    width: "var(--icon)",
                    height: "var(--icon)",
                    borderRadius: 10,
                    display: "grid",
                    placeItems: "center",
                    flex: "none",
                    background: "var(--surface)",
                    color: "var(--text)",
                }}
            >
                <Icon name={props.icon} size={16} />
            </span>
            <span style={{ minWidth: 0, flex: "1 1 auto" }}>
                <span
                    style={{
                        display: "block",
                        fontSize: "var(--action)",
                        lineHeight: 1.35,
                        fontWeight: 600,
                        letterSpacing: "-0.015em",
                        color: "var(--text)",
                    }}
                >
                    {props.title}
                </span>
                <span
                    style={{
                        display: "block",
                        marginTop: 2,
                        fontSize: "var(--body)",
                        lineHeight: 1.4,
                        color: "var(--muted)",
                    }}
                >
                    {props.description}
                </span>
            </span>
            <span className="vekta-so-arrow" style={{ flex: "none", color: "var(--muted)", display: "grid" }}>
                <Icon name="arrow" size={15} />
            </span>
        </div>
    )

    return (
        <Reveal progress={props.progress} start={props.start} end={props.start + 0.08} y={8}>
            <div>
                {props.href ? (
                    <a className="vekta-so-row vekta-so-link" href={props.href} style={{ display: "block", cursor: "pointer" }}>
                        {body}
                    </a>
                ) : (
                    <div className="vekta-so-row" style={{ cursor: "default" }}>
                        {body}
                    </div>
                )}
                {props.last ? null : (
                    <div style={{ height: 1, marginLeft: 56, background: props.divider }} />
                )}
            </div>
        </Reveal>
    )
}

function useEntrance(
    active: boolean,
    holdComplete: boolean,
    loop: boolean,
    speedRef: React.MutableRefObject<number>,
    loopRef: React.MutableRefObject<boolean>
) {
    const progress = useMotionValue(0)

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
    }, [active, loop, loopRef, progress, speedRef])

    return progress
}

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 620
 * @framerIntrinsicHeight 520
 */
export default function StrategyOverview(props: Partial<StrategyOverviewProps>) {
    const {
        theme = DEFAULTS.theme,
        accentColor = DEFAULTS.accentColor,
        backgroundColor = DEFAULTS.backgroundColor,
        borderRadius = DEFAULTS.borderRadius,
        showBorder = DEFAULTS.showBorder,
        productName = DEFAULTS.productName,
        subtitle = DEFAULTS.subtitle,
        statusLabel = DEFAULTS.statusLabel,
        raiseTarget = DEFAULTS.raiseTarget,
        fundingStage = DEFAULTS.fundingStage,
        strategyStatus = DEFAULTS.strategyStatus,
        recommendationHeading = DEFAULTS.recommendationHeading,
        recommendationDescription = DEFAULTS.recommendationDescription,
        aiBadgeText = DEFAULTS.aiBadgeText,
        showVerification = DEFAULTS.showVerification,
        autoPlay = DEFAULTS.autoPlay,
        animationSpeed = DEFAULTS.animationSpeed,
        loopAnimation = DEFAULTS.loopAnimation,
        enableHoverEffects = DEFAULTS.enableHoverEffects,
        previewProgress,
        style,
    } = props

    const rootRef = React.useRef<HTMLDivElement>(null)
    const [compact, setCompact] = React.useState(false)
    const [entered, setEntered] = React.useState(false)
    const [reduced, setReduced] = React.useState(prefersReducedMotion)
    const speedRef = React.useRef(1)
    const loopRef = React.useRef(false)
    speedRef.current = animationSpeed || 1
    loopRef.current = loopAnimation

    const scrubbing = typeof previewProgress === "number"
    const staticFrame = scrubbing || reduced || !autoPlay || isStaticTarget()
    const playing = entered && !staticFrame
    const progress = useEntrance(playing, staticFrame, loopAnimation, speedRef, loopRef)
    const scrub = useMotionValue(clamp01(previewProgress ?? 1))

    React.useLayoutEffect(() => {
        if (scrubbing) scrub.set(clamp01(previewProgress as number))
    }, [previewProgress, scrub, scrubbing])

    const clock = scrubbing ? scrub : progress
    const cardOpacity = useTransform(clock, (value) => reveal(value, 0, 0.09))
    const wash = useTransform(clock, (value) => {
        if (value < 0.34 || value > 0.56) return 0
        return Math.sin(((value - 0.34) / 0.22) * Math.PI)
    })

    const mode = theme === "dark" ? DARK : LIGHT
    const accent = resolveAccent(theme, accentColor)
    const background = resolveBackground(theme, backgroundColor)
    const badgeBackground = theme === "dark" ? "rgba(74,222,128,0.14)" : "#DCFCE7"
    const badgeColor = theme === "dark" ? accent : accent.toLowerCase() === "#16a34a" ? mode.badgeText : accent
    const radius = Math.max(0, borderRadius)
    const fixedHeight = style?.height != null && style.height !== "auto"

    React.useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
        const query = window.matchMedia("(prefers-reduced-motion: reduce)")
        const onChange = () => setReduced(query.matches)
        onChange()
        query.addEventListener("change", onChange)
        return () => query.removeEventListener("change", onChange)
    }, [])

    React.useEffect(() => {
        const element = rootRef.current
        if (!element) return
        const measure = (width: number) => {
            if (width > 0) setCompact(width < 480)
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
            { threshold: 0.35 }
        )
        observer.observe(element)
        return () => observer.disconnect()
    }, [staticFrame])

    const type = compact
        ? { pad: "16px", title: "16px", metric: "20px", section: "15px", action: "13.5px", body: "12.5px", label: "11px", icon: "34px", gap: "16px" }
        : { pad: "22px 24px", title: "18px", metric: "26px", section: "16px", action: "14px", body: "13px", label: "12px", icon: "36px", gap: "20px" }

    return (
        <div
            ref={rootRef}
            className="vekta-so"
            data-hover={enableHoverEffects ? "on" : "off"}
            style={{
                ...style,
                width: style?.width ?? "100%",
                height: style?.height ?? "auto",
                position: style?.position ?? "relative",
                transform: style?.transform,
                boxSizing: "border-box",
                minWidth: 0,
                display: "flex",
                overflow: "hidden",
                fontFamily: FONT,
                ["--accent" as string]: accent,
                ["--text" as string]: mode.text,
                ["--muted" as string]: mode.muted,
                ["--surface" as string]: mode.surface,
                ["--hover" as string]: mode.hover,
                ["--icon-hover" as string]: mode.iconHover,
                ["--title" as string]: type.title,
                ["--metric" as string]: type.metric,
                ["--section" as string]: type.section,
                ["--action" as string]: type.action,
                ["--body" as string]: type.body,
                ["--label" as string]: type.label,
                ["--icon" as string]: type.icon,
            }}
        >
            <style>{CSS}</style>
            <motion.article
                aria-label={`${productName} strategy overview`}
                style={{
                    opacity: cardOpacity,
                    width: "100%",
                    height: fixedHeight ? "100%" : "auto",
                    minHeight: 0,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: type.gap,
                    padding: type.pad,
                    overflowX: "hidden",
                    overflowY: fixedHeight ? "auto" : "visible",
                    background,
                    color: mode.text,
                    borderRadius: radius,
                    border: showBorder ? `1px solid ${mode.border}` : "none",
                }}
            >
                <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <Reveal progress={clock} start={0.02} end={0.1} y={6} style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                            <span style={{ color: accent, display: "grid", marginTop: 1, flex: "none" }}>
                                <Icon name="sparkles" size={16} />
                            </span>
                            <div style={{ minWidth: 0 }}>
                                <div
                                    style={{
                                        fontSize: "var(--title)",
                                        lineHeight: 1.25,
                                        fontWeight: 600,
                                        letterSpacing: "-0.025em",
                                        overflowWrap: "break-word",
                                    }}
                                >
                                    {productName} / Strategy Overview
                                </div>
                                <div style={{ marginTop: 3, fontSize: "var(--label)", lineHeight: 1.4, color: mode.muted }}>
                                    {subtitle}
                                </div>
                            </div>
                        </div>
                    </Reveal>
                    <StatusBadge progress={clock} label={statusLabel} background={badgeBackground} color={badgeColor} />
                </header>

                <section
                    aria-label="Fundraising metrics"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        columnGap: compact ? 10 : 16,
                    }}
                >
                    <Metric progress={clock} label="Raise target" value={raiseTarget} fadeStart={0.125} fadeEnd={0.2} count />
                    <Metric progress={clock} label="Funding stage" value={fundingStage} fadeStart={0.19} fadeEnd={0.27} />
                    <Metric progress={clock} label="Strategy" value={strategyStatus} fadeStart={0.24} fadeEnd={0.32} />
                </section>

                <section aria-label={recommendationHeading} style={{ position: "relative" }}>
                    <motion.div
                        aria-hidden
                        style={{
                            position: "absolute",
                            inset: "-8px -10px",
                            borderRadius: 14,
                            background: mode.wash,
                            opacity: wash,
                            pointerEvents: "none",
                        }}
                    />
                    <Reveal progress={clock} start={0.33} end={0.42}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                            <h2
                                style={{
                                    margin: 0,
                                    fontSize: "var(--section)",
                                    lineHeight: 1.3,
                                    fontWeight: 600,
                                    letterSpacing: "-0.02em",
                                }}
                            >
                                {recommendationHeading}
                            </h2>
                            <Reveal progress={clock} start={0.38} end={0.46} style={{ flex: "none" }}>
                                <span
                                    style={{
                                        display: "inline-flex",
                                        padding: "4px 8px",
                                        borderRadius: 999,
                                        background: mode.surface,
                                        border: `1px solid ${mode.border}`,
                                        color: mode.muted,
                                        fontSize: 11,
                                        lineHeight: 1,
                                        fontWeight: 500,
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {aiBadgeText}
                                </span>
                            </Reveal>
                        </div>
                    </Reveal>
                    <Reveal progress={clock} start={0.37} end={0.48} y={8}>
                        <p
                            style={{
                                margin: "8px 0 0",
                                fontSize: "var(--body)",
                                lineHeight: 1.5,
                                color: mode.text,
                                overflowWrap: "break-word",
                            }}
                        >
                            {recommendationDescription}
                        </p>
                    </Reveal>
                    {showVerification ? (
                        <Reveal progress={clock} start={0.45} end={0.54} y={4}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, color: mode.muted }}>
                                <span style={{ color: accent, display: "grid", flex: "none" }}>
                                    <Icon name="checkCircle" size={14} />
                                </span>
                                <span style={{ fontSize: "var(--label)", lineHeight: 1.4 }}>
                                    Based on company profile and funding goals
                                </span>
                            </div>
                        </Reveal>
                    ) : null}
                </section>

                <section aria-label="Your next best moves" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <Reveal progress={clock} start={0.5} end={0.58}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                            <h2
                                style={{
                                    margin: 0,
                                    fontSize: "var(--section)",
                                    lineHeight: 1.3,
                                    fontWeight: 600,
                                    letterSpacing: "-0.02em",
                                }}
                            >
                                Your next best moves
                            </h2>
                            <span style={{ flex: "none", fontSize: "var(--label)", color: mode.muted }}>Example priorities</span>
                        </div>
                    </Reveal>
                    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                        {ACTIONS.map((action, index) => (
                            <li key={action.icon}>
                                <ActionRow
                                    progress={clock}
                                    start={0.52 + index * 0.07}
                                    icon={action.icon}
                                    title={String(props[action.title] ?? DEFAULTS[action.title])}
                                    description={String(props[action.body] ?? DEFAULTS[action.body])}
                                    href={String(props[action.link] ?? "").trim() || undefined}
                                    last={index === ACTIONS.length - 1}
                                    divider={mode.divider}
                                />
                            </li>
                        ))}
                    </ul>
                </section>
            </motion.article>
        </div>
    )
}

StrategyOverview.defaultProps = DEFAULTS
StrategyOverview.displayName = "Strategy Overview"

addPropertyControls(StrategyOverview, {
    theme: {
        type: ControlType.Enum,
        title: "Theme",
        options: ["light", "dark"],
        optionTitles: ["Light", "Dark"],
        defaultValue: DEFAULTS.theme,
    },
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
    borderRadius: {
        type: ControlType.Number,
        title: "Border Radius",
        defaultValue: DEFAULTS.borderRadius,
        min: 0,
        max: 32,
        step: 1,
    },
    showBorder: {
        type: ControlType.Boolean,
        title: "Show Border",
        defaultValue: DEFAULTS.showBorder,
        enabledTitle: "Show",
        disabledTitle: "Hide",
    },
    productName: {
        type: ControlType.String,
        title: "Product Name",
        defaultValue: DEFAULTS.productName,
    },
    subtitle: {
        type: ControlType.String,
        title: "Subtitle",
        defaultValue: DEFAULTS.subtitle,
    },
    statusLabel: {
        type: ControlType.String,
        title: "Status Label",
        defaultValue: DEFAULTS.statusLabel,
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
    strategyStatus: {
        type: ControlType.String,
        title: "Strategy Status",
        defaultValue: DEFAULTS.strategyStatus,
    },
    recommendationHeading: {
        type: ControlType.String,
        title: "Recommendation Heading",
        defaultValue: DEFAULTS.recommendationHeading,
    },
    recommendationDescription: {
        type: ControlType.String,
        title: "Recommendation",
        defaultValue: DEFAULTS.recommendationDescription,
        displayTextArea: true,
    },
    aiBadgeText: {
        type: ControlType.String,
        title: "AI Badge Text",
        defaultValue: DEFAULTS.aiBadgeText,
    },
    showVerification: {
        type: ControlType.Boolean,
        title: "Show Verification",
        defaultValue: DEFAULTS.showVerification,
        enabledTitle: "Show",
        disabledTitle: "Hide",
    },
    action1Title: { type: ControlType.String, title: "Action 1 Title", defaultValue: DEFAULTS.action1Title },
    action1Description: { type: ControlType.String, title: "Action 1 Description", defaultValue: DEFAULTS.action1Description },
    action1Link: { type: ControlType.Link, title: "Action 1 Link" },
    action2Title: { type: ControlType.String, title: "Action 2 Title", defaultValue: DEFAULTS.action2Title },
    action2Description: { type: ControlType.String, title: "Action 2 Description", defaultValue: DEFAULTS.action2Description },
    action2Link: { type: ControlType.Link, title: "Action 2 Link" },
    action3Title: { type: ControlType.String, title: "Action 3 Title", defaultValue: DEFAULTS.action3Title },
    action3Description: { type: ControlType.String, title: "Action 3 Description", defaultValue: DEFAULTS.action3Description },
    action3Link: { type: ControlType.Link, title: "Action 3 Link" },
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
        description: "1 plays the entrance in about 8 seconds.",
        defaultValue: DEFAULTS.animationSpeed,
        min: 0.5,
        max: 2,
        step: 0.1,
    },
    loopAnimation: {
        type: ControlType.Boolean,
        title: "Loop Animation",
        defaultValue: DEFAULTS.loopAnimation,
        enabledTitle: "Loop",
        disabledTitle: "Once",
    },
    enableHoverEffects: {
        type: ControlType.Boolean,
        title: "Enable Hover Effects",
        defaultValue: DEFAULTS.enableHoverEffects,
        enabledTitle: "On",
        disabledTitle: "Off",
    },
})
