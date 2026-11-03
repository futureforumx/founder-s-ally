// Get Started: https://www.framer.com/developers

import { addPropertyControls, ControlType, useIsOnFramerCanvas } from "framer"
import React, {
    useEffect,
    useMemo,
    useState,
    Children,
    type ComponentProps,
    type CSSProperties,
    type ReactNode,
} from "react"
import {
    AnimatePresence,
    motion,
    useMotionValueEvent,
    useReducedMotion,
    useScroll,
    useTransform,
} from "framer-motion"
import PointMorph from "https://framer.com/m/PointShapeMorphThreeJSV2-IOUWiL.js"
import { fallbackPropertyControls } from "https://framer.com/m/WebGLGuard-XiTZOn.js@vzHDEjfCUyxp7TALvzS0"

/**
 * File analytics — views, viewers, dwell, and diligence for one shared file.
 * Scroll through a named section to step scenes. PointMorph holds the field.
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 */
export default function FileAnalytics({
    sectionName = "",
    slot,
    previewShape = 0,
    fileName = "Series A Deck.pdf",
    fileKind = "Shared file",
    views = 47,
    uniqueVisitors = 12,
    avgTime = "4m 12s",
    lastOpen = "2m ago",
    completion = 68,
    forwarded = 2,
    viewers,
    slides,
    spark,
    autoPlay = true,
    ...pointMorphProps
}: Props) {
    const isEditor = useIsOnFramerCanvas()
    const reduceMotion = useReducedMotion()
    const custom = Children.toArray(slot)
    const scenes = useMemo(
        () =>
            custom.length > 0
                ? custom
                : builtInScenes({
                      fileName,
                      fileKind,
                      views,
                      uniqueVisitors,
                      avgTime,
                      lastOpen,
                      completion,
                      forwarded,
                      viewers: viewers ?? DEFAULT_VIEWERS,
                      slides: slides ?? DEFAULT_SLIDES,
                      spark: spark ?? DEFAULT_SPARK,
                  }),
        [
            custom,
            fileName,
            fileKind,
            views,
            uniqueVisitors,
            avgTime,
            lastOpen,
            completion,
            forwarded,
            viewers,
            slides,
            spark,
        ]
    )
    const total = scenes.length || 1

    const [sectionEl, setSectionEl] = useState<HTMLElement | null>(null)
    const hasSection = Boolean(sectionEl)

    useEffect(() => {
        if (!sectionName) {
            setSectionEl(null)
            return
        }
        setSectionEl(document.getElementById(sectionName))
    }, [sectionName])

    const { scrollYProgress } = useScroll(
        sectionEl
            ? { target: { current: sectionEl }, offset: ["start center", "end center"] }
            : { offset: ["start", "end"] }
    )

    const [activeIndex, setActiveIndex] = useState(0)

    useEffect(() => {
        if (!hasSection) return
        const unsubscribe = scrollYProgress.on("change", (progress) => {
            const raw = Math.floor(progress * total)
            setActiveIndex(Math.min(Math.max(raw, 0), total - 1))
        })
        return unsubscribe
    }, [scrollYProgress, total, hasSection])

    useEffect(() => {
        if (isEditor || hasSection || !autoPlay || total < 2) return
        const id = window.setInterval(() => {
            setActiveIndex((current) => (current + 1) % total)
        }, 3600)
        return () => window.clearInterval(id)
    }, [autoPlay, hasSection, isEditor, total])

    const halfSection = useMemo(() => 1 / (total * 2), [total])
    const activeRange = useTransform(scrollYProgress, (value) => clamp(halfSection, 1 - halfSection, value))
    const visibilityMapping = useTransform(activeRange, (value) => triangleWave(value, total) * 0.5 + 0.3 > 0)
    const [visible, setVisible] = useState(true)

    useMotionValueEvent(visibilityMapping, "change", (latest) => {
        if (hasSection) setVisible(latest)
    })

    const sceneIndex =
        isEditor || (!hasSection && !autoPlay)
            ? clamp(0, total - 1, previewShape)
            : activeIndex
    const activeChild = scenes[sceneIndex]
    const shape = isEditor ? clamp(0, total - 1, previewShape) : sceneIndex

    return (
        <div style={shell}>
            <PointMorph
                {...pointMorphProps}
                style={field}
                currentShape={shape}
            />
            <AnimatePresence mode="wait" initial={false}>
                {visible && (
                    <motion.div
                        key={sceneIndex}
                        initial={
                            reduceMotion
                                ? { opacity: 0 }
                                : { opacity: 0, scale: 0.95, filter: "blur(8px)" }
                        }
                        animate={{
                            opacity: 1,
                            scale: 1,
                            filter: "blur(0px)",
                            transition: {
                                duration: 0.1,
                                ease: "easeOut",
                                filter: { duration: 0.3, ease: "easeOut" },
                                scale: { duration: 0.3, ease: "easeOut" },
                            },
                        }}
                        exit={{
                            opacity: 0,
                            scale: 0.95,
                            filter: "blur(8px)",
                            transition: { duration: 0.15, ease: "easeIn" },
                        }}
                        style={stage}
                    >
                        <div style={slotFrame}>{activeChild}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

type ViewerRow = { name: string; firm: string; when: string; dwell: string }
type SlideRow = { title: string; seconds: number; hotspot: boolean }

type Props = Omit<ComponentProps<typeof PointMorph>, "currentShape"> & {
    sectionName?: string
    slot?: ReactNode
    previewShape?: number
    fileName?: string
    fileKind?: string
    views?: number
    uniqueVisitors?: number
    avgTime?: string
    lastOpen?: string
    completion?: number
    forwarded?: number
    viewers?: ViewerRow[]
    slides?: SlideRow[]
    spark?: string
    autoPlay?: boolean
}

const TEXT = "#EEEEEE"
const MUTED = "#8A8A96"
const LINE = "rgba(255,255,255,0.10)"
const PRIMARY = "#5B5CFF"
const MINT = "#2EE6A6"
const SPACE = `"Space Grotesk", "Inter", ui-sans-serif, system-ui, sans-serif`
const SANS = `Inter, ui-sans-serif, system-ui, sans-serif`

const DEFAULT_VIEWERS: ViewerRow[] = [
    { name: "Maya Chen", firm: "Sequoia", when: "8m ago", dwell: "11 slides" },
    { name: "Jordan Hale", firm: "a16z", when: "2h ago", dwell: "6 slides" },
    { name: "Priya Shah", firm: "First Round", when: "1d ago", dwell: "14 slides" },
]

const DEFAULT_SLIDES: SlideRow[] = [
    { title: "Problem", seconds: 48, hotspot: false },
    { title: "Traction", seconds: 71, hotspot: true },
    { title: "Product", seconds: 36, hotspot: false },
    { title: "Team", seconds: 14, hotspot: false },
    { title: "Ask", seconds: 22, hotspot: false },
]

const DEFAULT_SPARK = "8,11,9,14,18,16,22,28,24,31,29,36"

function builtInScenes(data: {
    fileName: string
    fileKind: string
    views: number
    uniqueVisitors: number
    avgTime: string
    lastOpen: string
    completion: number
    forwarded: number
    viewers: ViewerRow[]
    slides: SlideRow[]
    spark: string
}): ReactNode[] {
    return [
        <Overview key="overview" {...data} />,
        <Viewers key="viewers" fileName={data.fileName} rows={data.viewers} />,
        <Dwell key="dwell" fileName={data.fileName} slides={data.slides} />,
        <Signals
            key="signals"
            fileName={data.fileName}
            completion={data.completion}
            forwarded={data.forwarded}
            uniqueVisitors={data.uniqueVisitors}
        />,
    ]
}

function Overview({
    fileName,
    fileKind,
    views,
    uniqueVisitors,
    avgTime,
    lastOpen,
    spark,
}: {
    fileName: string
    fileKind: string
    views: number
    uniqueVisitors: number
    avgTime: string
    lastOpen: string
    spark: string
}) {
    return (
        <div style={panel}>
            <p style={kindStyle}>{fileKind}</p>
            <p style={fileStyle}>{fileName}</p>
            <p style={count}>{formatCount(views)}</p>
            <p style={countLabel}>views</p>
            <Sparkline raw={spark} />
            <div style={metaRow}>
                <Meta label="unique" value={String(uniqueVisitors)} />
                <Meta label="avg time" value={avgTime} />
                <Meta label="last open" value={lastOpen} />
            </div>
        </div>
    )
}

function Viewers({ fileName, rows }: { fileName: string; rows: ViewerRow[] }) {
    return (
        <div style={panel}>
            <p style={kindStyle}>Opened by</p>
            <p style={fileStyle}>{fileName}</p>
            <ul style={ledger}>
                {rows.map((row, i) => (
                    <li key={`${row.name}-${i}`} style={ledgerRow}>
                        <span style={ledgerName}>
                            {row.name}
                            <span style={ledgerFirm}>{row.firm}</span>
                        </span>
                        <span style={ledgerWhen}>
                            {row.when}
                            <span style={ledgerDwell}>{row.dwell}</span>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

function Dwell({ fileName, slides }: { fileName: string; slides: SlideRow[] }) {
    const max = Math.max(...slides.map((s) => s.seconds), 1)
    return (
        <div style={panel}>
            <p style={kindStyle}>Where they stayed</p>
            <p style={fileStyle}>{fileName}</p>
            <ul style={dwellList}>
                {slides.map((slide) => (
                    <li key={slide.title} style={dwellRow}>
                        <span style={dwellTitle}>{slide.title}</span>
                        <span style={dwellTrack}>
                            <span
                                style={{
                                    ...dwellFill,
                                    width: `${Math.max(6, (slide.seconds / max) * 100)}%`,
                                    background: slide.hotspot ? PRIMARY : "rgba(238,238,238,0.28)",
                                }}
                            />
                        </span>
                        <span style={dwellTime}>{formatSeconds(slide.seconds)}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

function Signals({
    fileName,
    completion,
    forwarded,
    uniqueVisitors,
}: {
    fileName: string
    completion: number
    forwarded: number
    uniqueVisitors: number
}) {
    return (
        <div style={panel}>
            <p style={kindStyle}>Diligence</p>
            <p style={fileStyle}>{fileName}</p>
            <p style={signalLine}>
                <span style={{ color: MINT }}>{completion}%</span> finished the deck
            </p>
            <p style={signalSub}>
                {forwarded} {forwarded === 1 ? "link looks forwarded" : "links look forwarded"}
                <span style={signalDot}>·</span>
                {uniqueVisitors} unique visitors
            </p>
        </div>
    )
}

function Meta({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p style={metaValue}>{value}</p>
            <p style={metaLabel}>{label}</p>
        </div>
    )
}

function Sparkline({ raw }: { raw: string }) {
    const values = raw
        .split(",")
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isFinite(n))
    if (values.length < 2) return null
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = Math.max(max - min, 1)
    const w = 220
    const h = 36
    const d = values
        .map((v, i) => {
            const x = (i / (values.length - 1)) * w
            const y = h - ((v - min) / span) * (h - 4) - 2
            return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
        })
        .join(" ")
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ margin: "12px auto 0", display: "block" }} aria-hidden="true">
            <path d={d} fill="none" stroke={PRIMARY} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    )
}

function formatCount(n: number) {
    return new Intl.NumberFormat("en-US").format(n)
}

function formatSeconds(n: number) {
    if (n < 60) return `${n}s`
    const m = Math.floor(n / 60)
    const s = n % 60
    return s ? `${m}m ${s}s` : `${m}m`
}

function triangleWave(t: number, frequency = 1, amplitude = 1, phase = 0) {
    const period = 1 / frequency
    const shifted = (t + phase / (2 * Math.PI * frequency)) % period
    const norm = (((shifted % period) + period) % period) / period
    return amplitude * (norm < 0.5 ? 4 * norm - 1 : 3 - 4 * norm)
}

function clamp(min: number, max: number, value: number) {
    return Math.min(Math.max(value, min), max)
}

const shell: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    color: TEXT,
    fontFamily: SANS,
}

const field: CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
}

const stage: CSSProperties = {
    width: "100%",
    height: "100%",
}

const slotFrame: CSSProperties = {
    pointerEvents: "none",
    userSelect: "none",
    width: "100%",
    height: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "0px 12px",
    boxSizing: "border-box",
}

const panel: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "min(100%, 360px)",
    textAlign: "center",
}

const kindStyle: CSSProperties = {
    margin: 0,
    fontFamily: SPACE,
    fontSize: 13,
    fontWeight: 500,
    color: MUTED,
}

const fileStyle: CSSProperties = {
    margin: "4px 0 0",
    fontFamily: SPACE,
    fontSize: 16,
    fontWeight: 500,
    color: TEXT,
}

const count: CSSProperties = {
    margin: "18px 0 0",
    fontFamily: SANS,
    fontSize: 72,
    fontWeight: 600,
    letterSpacing: "-0.04em",
    lineHeight: 0.92,
    fontVariantNumeric: "tabular-nums",
    color: TEXT,
}

const countLabel: CSSProperties = {
    margin: "6px 0 0",
    fontFamily: SPACE,
    fontSize: 16,
    fontWeight: 500,
    color: PRIMARY,
}

const metaRow: CSSProperties = {
    display: "flex",
    justifyContent: "center",
    gap: 28,
    marginTop: 18,
}

const metaValue: CSSProperties = {
    margin: 0,
    fontFamily: SANS,
    fontSize: 15,
    fontWeight: 500,
    fontVariantNumeric: "tabular-nums",
    color: TEXT,
}

const metaLabel: CSSProperties = {
    margin: "3px 0 0",
    fontFamily: SPACE,
    fontSize: 12,
    color: MUTED,
}

const ledger: CSSProperties = {
    listStyle: "none",
    margin: "16px 0 0",
    padding: 0,
    width: "100%",
    textAlign: "left",
}

const ledgerRow: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 16,
    padding: "10px 0",
    borderBottom: `1px solid ${LINE}`,
}

const ledgerName: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    fontFamily: SPACE,
    fontSize: 15,
    fontWeight: 500,
    color: TEXT,
}

const ledgerFirm: CSSProperties = {
    fontFamily: SANS,
    fontSize: 12,
    fontWeight: 400,
    color: MUTED,
}

const ledgerWhen: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2,
    fontFamily: SANS,
    fontSize: 13,
    fontVariantNumeric: "tabular-nums",
    color: TEXT,
}

const ledgerDwell: CSSProperties = {
    fontSize: 12,
    color: MUTED,
}

const dwellList: CSSProperties = {
    listStyle: "none",
    margin: "18px 0 0",
    padding: 0,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    textAlign: "left",
}

const dwellRow: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "88px 1fr 48px",
    alignItems: "center",
    gap: 12,
}

const dwellTitle: CSSProperties = {
    fontFamily: SPACE,
    fontSize: 13,
    color: TEXT,
}

const dwellTrack: CSSProperties = {
    height: 3,
    background: "rgba(255,255,255,0.08)",
    overflow: "hidden",
}

const dwellFill: CSSProperties = {
    display: "block",
    height: "100%",
}

const dwellTime: CSSProperties = {
    fontFamily: SANS,
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
    textAlign: "right",
    color: MUTED,
}

const signalLine: CSSProperties = {
    margin: "20px 0 0",
    fontFamily: SPACE,
    fontSize: 34,
    fontWeight: 500,
    letterSpacing: "-0.03em",
    lineHeight: 1.15,
    color: TEXT,
}

const signalSub: CSSProperties = {
    margin: "12px 0 0",
    fontFamily: SANS,
    fontSize: 14,
    color: MUTED,
}

const signalDot: CSSProperties = {
    margin: "0 8px",
    color: "rgba(255,255,255,0.24)",
}

addPropertyControls(FileAnalytics, {
    sectionName: {
        type: ControlType.String,
        title: "Section Name",
        placeholder: "e.g. file-analytics",
        defaultValue: "",
        description: "Page section `id` whose scroll progress steps the scenes.",
    },
    slot: {
        type: ControlType.Slot,
        title: "Scenes",
        description: "Leave empty to use built-in file analytics. Drop components to replace them.",
    },
    fileName: {
        type: ControlType.String,
        title: "File",
        defaultValue: "Series A Deck.pdf",
    },
    fileKind: {
        type: ControlType.String,
        title: "Kind",
        defaultValue: "Shared file",
    },
    views: {
        type: ControlType.Number,
        title: "Views",
        defaultValue: 47,
        min: 0,
        step: 1,
    },
    uniqueVisitors: {
        type: ControlType.Number,
        title: "Unique",
        defaultValue: 12,
        min: 0,
        step: 1,
    },
    avgTime: {
        type: ControlType.String,
        title: "Avg Time",
        defaultValue: "4m 12s",
    },
    lastOpen: {
        type: ControlType.String,
        title: "Last Open",
        defaultValue: "2m ago",
    },
    completion: {
        type: ControlType.Number,
        title: "Completion %",
        defaultValue: 68,
        min: 0,
        max: 100,
        step: 1,
    },
    forwarded: {
        type: ControlType.Number,
        title: "Forwarded",
        defaultValue: 2,
        min: 0,
        step: 1,
    },
    spark: {
        type: ControlType.String,
        title: "Spark",
        defaultValue: DEFAULT_SPARK,
        description: "Comma-separated view counts for the sparkline.",
    },
    viewers: {
        type: ControlType.Array,
        title: "Viewers",
        maxCount: 8,
        defaultValue: DEFAULT_VIEWERS,
        control: {
            type: ControlType.Object,
            controls: {
                name: { type: ControlType.String, title: "Name" },
                firm: { type: ControlType.String, title: "Firm" },
                when: { type: ControlType.String, title: "When" },
                dwell: { type: ControlType.String, title: "Dwell" },
            },
        },
    },
    slides: {
        type: ControlType.Array,
        title: "Slides",
        maxCount: 12,
        defaultValue: DEFAULT_SLIDES,
        control: {
            type: ControlType.Object,
            controls: {
                title: { type: ControlType.String, title: "Title" },
                seconds: { type: ControlType.Number, title: "Seconds", min: 0, step: 1 },
                hotspot: { type: ControlType.Boolean, title: "Hotspot", defaultValue: false },
            },
        },
    },
    autoPlay: {
        type: ControlType.Boolean,
        title: "Autoplay",
        defaultValue: true,
        description: "Cycle scenes when no scroll section is found.",
    },
    refresh: {
        title: "Refresh",
        type: ControlType.Boolean,
        defaultValue: false,
    },
    debugMode: {
        title: "Debug Mode",
        type: ControlType.Boolean,
        defaultValue: false,
    },
    shapes: {
        title: "Shapes",
        type: ControlType.Array,
        control: {
            type: ControlType.Object,
            controls: {
                points: { title: "Points", type: ControlType.String, defaultValue: "" },
                threshold: {
                    title: "Threshold",
                    type: ControlType.Number,
                    defaultValue: 1,
                    min: 0,
                    max: 1,
                    step: 0.01,
                },
                scale: {
                    title: "Scale",
                    type: ControlType.Number,
                    defaultValue: 1,
                    min: 0.01,
                    max: 10,
                    step: 0.01,
                },
            },
        },
        defaultValue: [],
        maxCount: 10,
    },
    previewShape: {
        title: "Preview Shape",
        type: ControlType.Number,
        defaultValue: 0,
        min: 0,
        max: 10,
        step: 1,
    },
    tipRadius: {
        title: "Tip Radius",
        type: ControlType.Number,
        defaultValue: 0.0025,
        min: 0.001,
        max: 0.2,
        step: 0.001,
    },
    tipLayers: {
        title: "Tip Layers",
        type: ControlType.Number,
        defaultValue: 8,
        min: 1,
        max: 16,
        step: 1,
    },
    sizeVariance: {
        title: "Size Variance",
        type: ControlType.Number,
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.01,
    },
    dispersionBand: {
        title: "Dispersion Band",
        type: ControlType.Number,
        defaultValue: 0.9,
        min: 0,
        max: 1,
        step: 0.01,
    },
    dispersion: {
        title: "Dispersion",
        type: ControlType.Number,
        defaultValue: 0.8,
        min: 0,
        max: 1,
        step: 0.01,
    },
    tipTexture: { title: "Tip Texture", type: ControlType.Image },
    simSpring: {
        title: "Sim Spring",
        type: ControlType.Number,
        defaultValue: 40,
        min: 0.1,
        max: 200,
        step: 0.1,
    },
    simDamping: {
        title: "Sim Damping",
        type: ControlType.Number,
        defaultValue: 12,
        min: 0.1,
        max: 30,
        step: 0.1,
    },
    simMaxVelocity: {
        title: "Sim Max Velocity",
        type: ControlType.Number,
        defaultValue: 5,
        min: 0.1,
        max: 20,
        step: 0.1,
    },
    opacitySpeed: {
        title: "Opacity Speed",
        type: ControlType.Number,
        defaultValue: 2,
        min: 0.1,
        max: 20,
        step: 0.1,
    },
    springVariance: {
        title: "Spring Variance",
        type: ControlType.Number,
        defaultValue: 5,
        min: 0,
        max: 100,
        step: 0.1,
    },
    dispersionOffset: {
        title: "Dispersion Offset",
        type: ControlType.Number,
        defaultValue: 0.05,
        min: 0,
        max: 0.5,
        step: 0.001,
    },
    cameraFov: {
        title: "Camera FOV",
        type: ControlType.Number,
        defaultValue: 34,
        min: 10,
        max: 120,
        step: 1,
    },
    cameraPosition: {
        title: "Camera Position",
        type: ControlType.Object,
        controls: {
            x: { type: ControlType.Number, defaultValue: 0, min: -10, max: 10, step: 0.05 },
            y: { type: ControlType.Number, defaultValue: 0, min: -10, max: 10, step: 0.05 },
            z: { type: ControlType.Number, defaultValue: 1.8, min: -10, max: 10, step: 0.05 },
        },
    },
    ...fallbackPropertyControls,
})
