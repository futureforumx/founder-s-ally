import * as React from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

/**
 * Vekta — Company Intelligence
 *
 * One SVG scene. Sources, labels, beams, the intelligence node, and the
 * results card share a single viewBox, so a Framer resize scales them together.
 * Animation only changes SVG attributes (opacity, dash offset, user-unit
 * translate). It does not use CSS transforms, foreignObject, or absolute HTML.
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 760
 * @framerIntrinsicHeight 440
 */

const CYCLE = 8000
const TEXT = "#F5F7F5"
const MUTED = "#929A94"
const NODE = "#151815"
const CARD = "#181C19"
const INK = "#101110"
const BORDER = "rgba(255,255,255,0.10)"
const TRACK = "rgba(255,255,255,0.12)"
const IDLE_ICON = "#8B938E"
const FONT = `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

const TEXT_CSS = `
.vekta-ci text {
  font-family: ${FONT} !important;
  font-size: calc(var(--u) * var(--fs)) !important;
  font-weight: var(--fw, 500) !important;
  fill: var(--fill, ${TEXT}) !important;
}
`

const LOGO = { cx: 749.915, cy: 712.655, extent: 1073.09 }
const LOGO_PATHS = [
    {
        fill: "#ffffff",
        d: "M 1190.660156 392.269531 L 749.980469 176.113281 L 309.203125 392.269531 L 749.980469 608.425781 L 1190.660156 392.269531",
    },
    {
        fill: "#d9d9d9",
        d: "M 1284.550781 712.691406 L 1023.933594 584.847656 L 749.980469 719.1875 L 475.894531 584.847656 L 215.277344 712.691406 L 749.980469 974.941406 L 1284.550781 712.691406",
    },
    {
        fill: "#F5F7F5",
        d: "M 749.914062 1085.707031 L 475.929688 951.265625 L 309.238281 1033.046875 L 749.914062 1249.199219 L 1190.59375 1033.046875 L 1023.902344 951.265625 L 749.914062 1085.707031",
    },
] as const

type IconName = "file" | "chart" | "globe" | "users"
type BeamMode = "horizontal" | "vertical"

const SOURCES: { id: string; label: string; icon: IconName }[] = [
    { id: "deck", label: "Pitch Deck", icon: "file" },
    { id: "financials", label: "Financials", icon: "chart" },
    { id: "market", label: "Market Data", icon: "globe" },
    { id: "team", label: "Team Profile", icon: "users" },
]

interface Point {
    x: number
    y: number
    r: number
}

interface Scene {
    w: number
    h: number
    sources: Point[]
    center: Point
    card: { x: number; y: number; w: number; h: number }
    output: BeamMode
    icon: number
    labels: "below" | "before"
    titleAnchor: "middle" | "start"
    title: number
    subtitle: number
    label: number
}

const DESKTOP_CENTER = { x: 375, y: 210, r: 42 }
const DESKTOP_CARD_H = 130

const DESKTOP: Scene = {
    w: 760,
    h: 440,
    sources: [
        { x: 90, y: 72, r: 22 },
        { x: 90, y: 165, r: 22 },
        { x: 90, y: 258, r: 22 },
        { x: 90, y: 351, r: 22 },
    ],
    center: DESKTOP_CENTER,
    card: { x: 505, y: DESKTOP_CENTER.y - DESKTOP_CARD_H / 2, w: 225, h: DESKTOP_CARD_H },
    output: "horizontal",
    icon: 0.74,
    labels: "below",
    titleAnchor: "middle",
    title: 15,
    subtitle: 11,
    label: 12,
}

const MOBILE: Scene = {
    w: 360,
    h: 440,
    sources: [
        { x: 112, y: 52, r: 16 },
        { x: 112, y: 118, r: 16 },
        { x: 112, y: 184, r: 16 },
        { x: 112, y: 250, r: 16 },
    ],
    center: { x: 226, y: 151, r: 32 },
    card: { x: 16, y: 292, w: 328, h: 128 },
    output: "vertical",
    icon: 0.58,
    labels: "before",
    titleAnchor: "start",
    title: 13,
    subtitle: 10,
    label: 12,
}

const METRICS = [
    { label: "Stage", value: "Seed", col: 0, row: 0, accent: false },
    { label: "Sector", value: "B2B SaaS", col: 1, row: 0, accent: false },
    { label: "Growth", value: "+18% MoM", col: 0, row: 1, accent: true },
    { label: "Raise Target", value: "$2.5M", col: 1, row: 1, accent: false },
] as const

const NODE_START = [80, 460, 840, 1220]
const FLOW_WINDOW = [
    { start: 320, end: 2050 },
    { start: 700, end: 2550 },
    { start: 1080, end: 3100 },
    { start: 1460, end: 3650 },
]
const OUTPUT_WINDOW = { start: 4050, end: 5150 }
const CARD_WINDOW = { start: 4460, end: 5180 }
const CHECK_WINDOW = { start: 4720, end: 5200 }
const METRIC_AT = [4980, 5200, 5420, 5640]
const EXIT_AT = 7460

interface BeamState {
    draw: number
    packet: number
    opacity: number
}

interface FrameState {
    nodes: number[]
    beams: BeamState[]
    output: BeamState
    energy: number
    card: number
    slide: number
    metrics: number[]
    check: number
}

interface CompanyIntelligenceProps {
    accentColor: string
    backgroundColor: string
    animationSpeed: number
    autoPlay: boolean
    showLabels: boolean
    showResultsCard: boolean
    showBackgroundGrid: boolean
    previewTime?: number
    style?: React.CSSProperties
}

const DEFAULTS: CompanyIntelligenceProps = {
    accentColor: "#4ADE80",
    backgroundColor: "#101110",
    animationSpeed: 1,
    autoPlay: true,
    showLabels: true,
    showResultsCard: true,
    showBackgroundGrid: true,
}

function clamp01(value: number) {
    return Math.min(1, Math.max(0, value))
}

function easeOut(value: number) {
    return 1 - Math.pow(1 - clamp01(value), 3)
}

function easeIn(value: number) {
    const t = clamp01(value)
    return t * t * t
}

function num(value: number) {
    return String(Math.round(value * 10000) / 10000)
}

function exitFade(time: number) {
    if (time <= EXIT_AT) return 1
    return 1 - easeIn((time - EXIT_AT) / (CYCLE - EXIT_AT))
}

function nodeLevel(time: number, index: number) {
    const start = NODE_START[index]
    const duration = 380
    if (time < start) return 0
    const turned = time < start + duration ? easeOut((time - start) / duration) : 1
    return turned * exitFade(time)
}

function beamState(time: number, start: number, end: number): BeamState {
    const fade = exitFade(time)
    if (time < start) return { draw: 0, packet: 0, opacity: 0 }
    const travel = Math.min(1, (time - start) / (end - start))
    const growing = time < end
    const head = travel < 0.08 ? travel / 0.08 : travel > 0.9 ? Math.max(0, (1 - travel) / 0.1) : 1
    return {
        draw: growing ? travel : 1,
        packet: growing ? head * fade : 0,
        opacity: (growing ? Math.min(1, travel * 5) : 1) * fade,
    }
}

function centerEnergy(time: number) {
    const fade = exitFade(time)
    if (time < 1700 || time > 5900) return 0
    const gate = time < 2000 ? (time - 1700) / 300 : time > 5500 ? (5900 - time) / 400 : 1
    const wave = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((time / 740) * Math.PI * 2))
    let energy = wave * Math.max(0, gate)
    for (const window of FLOW_WINDOW) {
        const dt = time - window.end
        if (dt >= 0 && dt <= 460) energy += Math.sin((dt / 460) * Math.PI) * 0.45
    }
    if (time > 4000 && time < 5200) energy += Math.sin(((time - 4000) / 1200) * Math.PI) * 0.55
    return Math.min(1, energy) * fade
}

function cardMotion(time: number) {
    const fade = exitFade(time)
    let reveal = 0
    if (time >= CARD_WINDOW.end) reveal = 1
    else if (time > CARD_WINDOW.start) reveal = easeOut((time - CARD_WINDOW.start) / (CARD_WINDOW.end - CARD_WINDOW.start))
    const shown = reveal * fade
    return { opacity: shown, slide: (1 - shown) * 14 }
}

function metricLevel(time: number, at: number) {
    if (time < at) return 0
    if (time < at + 260) return easeOut((time - at) / 260)
    return 1
}

function checkLevel(time: number) {
    if (time < CHECK_WINDOW.start) return 0
    if (time < CHECK_WINDOW.end) return easeOut((time - CHECK_WINDOW.start) / (CHECK_WINDOW.end - CHECK_WINDOW.start))
    return 1
}

function settledFrame(): FrameState {
    return {
        nodes: [1, 1, 1, 1],
        beams: FLOW_WINDOW.map(() => ({ draw: 1, packet: 0, opacity: 1 })),
        output: { draw: 1, packet: 0, opacity: 1 },
        energy: 0,
        card: 1,
        slide: 0,
        metrics: [1, 1, 1, 1],
        check: 1,
    }
}

function buildFrame(time: number): FrameState {
    const card = cardMotion(time)
    return {
        nodes: SOURCES.map((_, index) => nodeLevel(time, index)),
        beams: FLOW_WINDOW.map((window) => beamState(time, window.start, window.end)),
        output: beamState(time, OUTPUT_WINDOW.start, OUTPUT_WINDOW.end),
        energy: centerEnergy(time),
        card: card.opacity,
        slide: card.slide,
        metrics: METRIC_AT.map((at) => metricLevel(time, at)),
        check: checkLevel(time),
    }
}

function sourceBeam(scene: Scene, index: number) {
    const source = scene.sources[index]
    const center = scene.center
    const x1 = source.x + source.r
    const y1 = source.y
    const x2 = center.x - center.r
    const y2 = center.y
    const dx = Math.max(32, (x2 - x1) * 0.52)
    return `M ${num(x1)} ${num(y1)} C ${num(x1 + dx)} ${num(y1)}, ${num(x2 - dx)} ${num(y2)}, ${num(x2)} ${num(y2)}`
}

function outputBeam(scene: Scene) {
    const { center, card, output } = scene
    if (output === "horizontal") {
        const y = center.y
        return `M ${num(center.x + center.r)} ${num(y)} H ${num(card.x)}`
    }
    const x1 = center.x
    const y1 = center.y + center.r
    const x2 = card.x + card.w / 2
    const y2 = card.y
    const dy = Math.max(24, (y2 - y1) * 0.46)
    return `M ${num(x1)} ${num(y1)} C ${num(x1)} ${num(y1 + dy)}, ${num(x2)} ${num(y2 - dy)}, ${num(x2)} ${num(y2)}`
}

function assertScene(scene: Scene) {
    scene.sources.forEach((source, index) => {
        const d = sourceBeam(scene, index)
        const start = `M ${num(source.x + source.r)} ${num(source.y)}`
        const end = `${num(scene.center.x - scene.center.r)} ${num(scene.center.y)}`
        if (!d.startsWith(start) || !d.endsWith(end)) {
            throw new Error(`Source beam ${index} is not attached to its nodes`)
        }
    })
    const output = outputBeam(scene)
    if (scene.output === "horizontal") {
        const mid = scene.card.y + scene.card.h / 2
        if (mid !== scene.center.y) throw new Error("Results card is not centered on the intelligence node")
        const expected = `M ${num(scene.center.x + scene.center.r)} ${num(scene.center.y)} H ${num(scene.card.x)}`
        if (output !== expected) throw new Error("Output beam is not on the centerline")
    } else if (!output.endsWith(`${num(scene.card.x + scene.card.w / 2)} ${num(scene.card.y)}`)) {
        throw new Error("Output beam misses the results card")
    }
}

assertScene(DESKTOP)
assertScene(MOBILE)

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

function useClock(playing: boolean, speedRef: React.MutableRefObject<number>) {
    const [time, setTime] = React.useState(0)

    React.useEffect(() => {
        if (!playing) return
        let frame = 0
        let last = performance.now()
        let elapsed = 0
        const tick = (now: number) => {
            const delta = Math.min(48, now - last)
            last = now
            elapsed = (elapsed + delta * speedRef.current) % CYCLE
            setTime(elapsed)
            frame = requestAnimationFrame(tick)
        }
        const stop = () => cancelAnimationFrame(frame)
        const start = () => {
            stop()
            last = performance.now()
            frame = requestAnimationFrame(tick)
        }
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
    }, [playing, speedRef])

    return time
}

function useSceneLayout(ref: React.RefObject<HTMLElement | null>) {
    const [layout, setLayout] = React.useState({ compact: false, unit: 1 })

    React.useLayoutEffect(() => {
        const element = ref.current
        if (!element) return
        const measure = (width: number, height: number) => {
            if (width <= 0 || height <= 0) return
            const compact = width < 480
            const scene = compact ? MOBILE : DESKTOP
            const unit = Math.round(Math.min(width / scene.w, height / scene.h) * 1000) / 1000
            setLayout((current) => {
                if (current.compact === compact && Math.abs(current.unit - unit) < 0.004) return current
                return { compact, unit: unit || 1 }
            })
        }
        measure(element.clientWidth, element.clientHeight)
        if (typeof ResizeObserver === "undefined") return
        const observer = new ResizeObserver(([entry]) => {
            measure(entry.contentRect.width, entry.contentRect.height)
        })
        observer.observe(element)
        return () => observer.disconnect()
    }, [ref])

    return layout
}

function rootStyle(style: React.CSSProperties | undefined, background: string, unit: number): React.CSSProperties {
    return {
        ...style,
        boxSizing: "border-box",
        minWidth: 0,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background,
        width: style?.width ?? "100%",
        height: style?.height ?? "100%",
        position: style?.position ?? "relative",
        transform: style?.transform,
        ["--u" as string]: `${unit}px`,
        userSelect: "none",
        WebkitFontSmoothing: "antialiased",
    }
}

function Icon({ name, color }: { name: IconName; color: string }) {
    const pen = {
        fill: "none",
        stroke: color,
        strokeWidth: 1.75,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
    }
    if (name === "file") {
        return (
            <g>
                <path {...pen} d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                <path {...pen} d="M14 2v4a2 2 0 0 0 2 2h4" />
                <path {...pen} d="M10 9H8" />
                <path {...pen} d="M16 13H8" />
                <path {...pen} d="M16 17H8" />
            </g>
        )
    }
    if (name === "chart") {
        return (
            <g>
                <path {...pen} d="M12 16v5" />
                <path {...pen} d="M16 14v7" />
                <path {...pen} d="M20 10v11" />
                <path {...pen} d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15" />
                <path {...pen} d="M4 18v3" />
                <path {...pen} d="M8 14v7" />
            </g>
        )
    }
    if (name === "globe") {
        return (
            <g>
                <circle {...pen} cx="12" cy="12" r="10" />
                <path {...pen} d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path {...pen} d="M2 12h20" />
            </g>
        )
    }
    return (
        <g>
            <path {...pen} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle {...pen} cx="9" cy="7" r="4" />
            <path {...pen} d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path {...pen} d="M16 3.13a4 4 0 0 1 0 7.75" />
        </g>
    )
}

function SceneText(props: {
    x: number
    y: number
    size: number
    weight?: number
    fill: string
    anchor?: "start" | "middle" | "end"
    opacity?: number
    children: string
}) {
    return (
        <text
            x={props.x}
            y={props.y}
            textAnchor={props.anchor ?? "start"}
            opacity={props.opacity ?? 1}
            fontSize={props.size}
            fontWeight={props.weight ?? 500}
            fill={props.fill}
            style={
                {
                    ["--fs" as string]: props.size,
                    ["--fw" as string]: props.weight ?? 500,
                    ["--fill" as string]: props.fill,
                } as React.CSSProperties
            }
        >
            {props.children}
        </text>
    )
}

function Beam({
    d,
    state,
    accent,
    track,
}: {
    d: string
    state: BeamState
    accent: string
    track: boolean
}) {
    return (
        <g>
            {track ? <path d={d} fill="none" stroke={TRACK} strokeWidth="1" /> : null}
            <path
                d={d}
                fill="none"
                stroke={accent}
                strokeWidth="1.4"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset={1 - state.draw}
                opacity={state.opacity * 0.72}
            />
            <path
                d={d}
                fill="none"
                stroke={accent}
                strokeWidth="2.15"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="0.12 1"
                strokeDashoffset={1 - state.draw * 1.12}
                opacity={state.packet}
            />
        </g>
    )
}

function SourceNode(props: {
    source: (typeof SOURCES)[number]
    point: Point
    scene: Scene
    level: number
    accent: string
    showLabel: boolean
}) {
    const { point, scene, level } = props
    const labelX = scene.labels === "before" ? -(point.r + 8) : 0
    const labelY = scene.labels === "before" ? 4 : point.r + 18
    const anchor = scene.labels === "before" ? "end" : "middle"
    const badge = point.r * 0.7

    return (
        <g transform={`translate(${point.x}, ${point.y})`}>
            <circle r={point.r} fill={NODE} stroke={BORDER} strokeWidth="1" />
            <circle r={point.r} fill="none" stroke={props.accent} strokeWidth="1.35" opacity={level} />
            <g transform={`scale(${scene.icon}) translate(-12, -12)`} opacity={1 - level}>
                <Icon name={props.source.icon} color={IDLE_ICON} />
            </g>
            <g transform={`scale(${scene.icon}) translate(-12, -12)`} opacity={level}>
                <Icon name={props.source.icon} color={TEXT} />
            </g>
            <g transform={`translate(${badge}, ${badge})`} opacity={level}>
                <circle r="4.4" fill={INK} />
                <circle r="3.15" fill={props.accent} />
            </g>
            {props.showLabel ? (
                <SceneText x={labelX} y={labelY} size={scene.label} fill={MUTED} anchor={anchor}>
                    {props.source.label}
                </SceneText>
            ) : null}
        </g>
    )
}

function IntelligenceNode(props: { scene: Scene; live: number; energy: number; accent: string; showLabels: boolean }) {
    const { center } = props.scene
    const scale = (center.r * 1.12) / LOGO.extent
    const titleX = props.scene.titleAnchor === "start" ? -center.r : 0
    return (
        <g transform={`translate(${center.x}, ${center.y})`}>
            {props.showLabels ? (
                <g>
                    <SceneText
                        x={titleX}
                        y={-(center.r + 34)}
                        size={props.scene.title}
                        weight={600}
                        fill={TEXT}
                        anchor={props.scene.titleAnchor}
                    >
                        Vekta Intelligence
                    </SceneText>
                    <SceneText
                        x={titleX}
                        y={-(center.r + 16)}
                        size={props.scene.subtitle}
                        fill={MUTED}
                        anchor={props.scene.titleAnchor}
                    >
                        Understanding your startup
                    </SceneText>
                </g>
            ) : null}
            <circle
                r={center.r + 6 + props.energy * 7}
                fill="none"
                stroke={props.accent}
                strokeWidth="1"
                opacity={props.energy * 0.75}
            />
            <circle r={center.r} fill={NODE} stroke={BORDER} strokeWidth="1" />
            <circle
                r={center.r}
                fill="none"
                stroke={props.accent}
                strokeWidth="1.5"
                opacity={props.live * (0.28 + props.energy * 0.72)}
            />
            <g transform={`scale(${num(scale)}) translate(${-LOGO.cx}, ${-LOGO.cy})`}>
                {LOGO_PATHS.map((path) => (
                    <path key={path.d.slice(0, 28)} d={path.d} fill={path.fill} />
                ))}
            </g>
        </g>
    )
}

function ResultsCard(props: { scene: Scene; frame: FrameState; accent: string }) {
    const { card } = props.scene
    const { frame } = props
    const slide = frame.slide > 0.05 ? `translate(${num(frame.slide)}, 0)` : undefined
    const col = (index: number) => (index === 0 ? 16 : Math.round(card.w * 0.5))
    const rowLabel = [58, 96]
    const checkX = card.w - 22
    const checkScale = frame.check > 0.999 ? 1 : 0.55 + 0.45 * frame.check

    return (
        <g opacity={frame.card} transform={slide}>
            <rect x={card.x} y={card.y} width={card.w} height={card.h} rx="14" fill={CARD} stroke={BORDER} strokeWidth="1" />
            <SceneText x={card.x + 16} y={card.y + 26} size={13} weight={600} fill={TEXT}>
                Company Profile Ready
            </SceneText>
            <g
                opacity={frame.check}
                transform={`translate(${card.x + checkX}, ${card.y + 20}) scale(${num(checkScale)})`}
            >
                <circle r="8" fill={props.accent} />
                <path
                    d="M -3.3 0.2 L -0.9 2.6 L 3.5 -2.5"
                    fill="none"
                    stroke={INK}
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </g>
            <line
                x1={card.x + 16}
                y1={card.y + 40}
                x2={card.x + card.w - 16}
                y2={card.y + 40}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
            />
            {METRICS.map((metric, index) => (
                <g key={metric.label} opacity={frame.metrics[index]}>
                    <SceneText x={card.x + col(metric.col)} y={card.y + rowLabel[metric.row]} size={10} fill={MUTED}>
                        {metric.label}
                    </SceneText>
                    <SceneText
                        x={card.x + col(metric.col)}
                        y={card.y + rowLabel[metric.row] + 15}
                        size={12}
                        weight={600}
                        fill={metric.accent ? props.accent : TEXT}
                    >
                        {metric.value}
                    </SceneText>
                </g>
            ))}
        </g>
    )
}

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 760
 * @framerIntrinsicHeight 440
 */
export default function CompanyIntelligence(props: Partial<CompanyIntelligenceProps>) {
    const {
        accentColor = DEFAULTS.accentColor,
        backgroundColor = DEFAULTS.backgroundColor,
        animationSpeed = DEFAULTS.animationSpeed,
        autoPlay = DEFAULTS.autoPlay,
        showLabels = DEFAULTS.showLabels,
        showResultsCard = DEFAULTS.showResultsCard,
        showBackgroundGrid = DEFAULTS.showBackgroundGrid,
        previewTime,
        style,
    } = props

    const rootRef = React.useRef<HTMLElement>(null)
    const layout = useSceneLayout(rootRef)
    const [reduced, setReduced] = React.useState(prefersReducedMotion)
    const speedRef = React.useRef(1)
    speedRef.current = Math.min(2, Math.max(0.5, animationSpeed || 1))

    const frozen = isFrozenTarget()
    const scrubbing = typeof previewTime === "number"
    const settled = !scrubbing && (!autoPlay || reduced || frozen)
    const playing = autoPlay && !reduced && !frozen && !scrubbing
    const time = useClock(playing, speedRef)
    const frame = settled ? settledFrame() : buildFrame(scrubbing ? (previewTime as number) : time)
    const scene = layout.compact ? MOBILE : DESKTOP
    const reactId = React.useId().replace(/:/g, "")
    const dotId = `vekta-ci-dots-${reactId}`
    const fadeId = `vekta-ci-fade-${reactId}`
    const maskId = `vekta-ci-mask-${reactId}`
    const beams = scene.sources.map((_, index) => sourceBeam(scene, index))
    const output = outputBeam(scene)
    const live = Math.max(...frame.nodes)

    React.useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
        const query = window.matchMedia("(prefers-reduced-motion: reduce)")
        const onChange = () => setReduced(query.matches)
        onChange()
        query.addEventListener("change", onChange)
        return () => query.removeEventListener("change", onChange)
    }, [])

    return (
        <section
            ref={rootRef}
            className="vekta-ci"
            aria-label="Vekta Intelligence reading pitch deck, financials, market data, and team profile into a company profile"
            style={rootStyle(style, backgroundColor, layout.unit)}
        >
            <style>{TEXT_CSS}</style>
            <svg
                viewBox={`0 0 ${scene.w} ${scene.h}`}
                width="100%"
                height="100%"
                preserveAspectRatio="xMidYMid meet"
                aria-hidden="true"
                style={{ display: "block", width: "100%", height: "100%", minWidth: 0, minHeight: 0 }}
            >
                <rect width={scene.w} height={scene.h} fill={backgroundColor} />
                {showBackgroundGrid ? (
                    <>
                        <defs>
                            <pattern id={dotId} width="18" height="18" patternUnits="userSpaceOnUse">
                                <circle cx="1" cy="1" r="0.7" fill="rgba(255,255,255,0.26)" />
                            </pattern>
                            <radialGradient id={fadeId} cx="50%" cy="48%" r="68%">
                                <stop offset="0%" stopColor="white" stopOpacity="0.85" />
                                <stop offset="58%" stopColor="white" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="white" stopOpacity="0" />
                            </radialGradient>
                            <mask id={maskId}>
                                <rect width={scene.w} height={scene.h} fill={`url(#${fadeId})`} />
                            </mask>
                        </defs>
                        <rect width={scene.w} height={scene.h} fill={`url(#${dotId})`} mask={`url(#${maskId})`} />
                    </>
                ) : null}

                <g>
                    {beams.map((d, index) => (
                        <Beam key={SOURCES[index].id} d={d} state={frame.beams[index]} accent={accentColor} track />
                    ))}
                    {showResultsCard ? <Beam d={output} state={frame.output} accent={accentColor} track={false} /> : null}
                </g>

                {SOURCES.map((source, index) => (
                    <SourceNode
                        key={source.id}
                        source={source}
                        point={scene.sources[index]}
                        scene={scene}
                        level={frame.nodes[index]}
                        accent={accentColor}
                        showLabel={showLabels}
                    />
                ))}

                <IntelligenceNode scene={scene} live={live} energy={frame.energy} accent={accentColor} showLabels={showLabels} />

                {showResultsCard ? <ResultsCard scene={scene} frame={frame} accent={accentColor} /> : null}
            </svg>
        </section>
    )
}

CompanyIntelligence.defaultProps = {
    accentColor: DEFAULTS.accentColor,
    backgroundColor: DEFAULTS.backgroundColor,
    animationSpeed: DEFAULTS.animationSpeed,
    autoPlay: DEFAULTS.autoPlay,
    showLabels: DEFAULTS.showLabels,
    showResultsCard: DEFAULTS.showResultsCard,
    showBackgroundGrid: DEFAULTS.showBackgroundGrid,
}
CompanyIntelligence.displayName = "Company Intelligence"

addPropertyControls(CompanyIntelligence, {
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
    showLabels: {
        type: ControlType.Boolean,
        title: "Show Labels",
        defaultValue: DEFAULTS.showLabels,
        enabledTitle: "Show",
        disabledTitle: "Hide",
    },
    showResultsCard: {
        type: ControlType.Boolean,
        title: "Show Results Card",
        defaultValue: DEFAULTS.showResultsCard,
        enabledTitle: "Show",
        disabledTitle: "Hide",
    },
    showBackgroundGrid: {
        type: ControlType.Boolean,
        title: "Show Background Grid",
        defaultValue: DEFAULTS.showBackgroundGrid,
        enabledTitle: "Show",
        disabledTitle: "Hide",
    },
})
