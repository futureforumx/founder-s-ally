import * as React from "react"
import {
    addPropertyControls,
    ControlType,
    RenderTarget,
    useIsStaticRenderer,
} from "framer"

/**
 * The Vekta lockup (415x87), baked in as white ink on transparency so the
 * sampler can read it straight out of the alpha channel with no upload.
 */
const VEKTA_LOGO_URI =
    "data:image/png;base64,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"

const DEFAULT_CHARS = " .:-=+*#%@"
const MONO_STACK = `ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace`

/** Deterministic noise table, used for shimmer and reveal scramble. */
const NOISE = (() => {
    const table = new Float32Array(4096)
    let seed = 1337
    for (let i = 0; i < table.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0
        table[i] = seed / 4294967296
    }
    return table
})()

type Effect = "none" | "scan" | "shimmer" | "reveal" | "pulse"

interface Props {
    image?: string | { src?: string }
    alt: string
    invert: boolean
    logoScale: number
    columns: number
    charSet: string
    contrast: number
    charScale: number
    backgroundColor: string
    textColor: string
    gradient: boolean
    textColorEnd: string
    fadeDim: boolean
    glow: number
    effect: Effect
    speed: number
    intensity: number
    revealLoop: boolean
    cursorGlow: boolean
    style?: React.CSSProperties
}

const DEFAULTS = {
    alt: "Vekta",
    invert: false,
    logoScale: 0.86,
    columns: 150,
    charSet: DEFAULT_CHARS,
    contrast: 1.2,
    charScale: 1.35,
    backgroundColor: "#000000",
    textColor: "#5B5CFF",
    gradient: true,
    textColorEnd: "#2EE6A6",
    fadeDim: true,
    glow: 10,
    effect: "scan" as Effect,
    speed: 1,
    intensity: 0.6,
    revealLoop: true,
    cursorGlow: true,
}

/**
 * VEKTA — ASCII Logo
 *
 * Renders the Vekta logo (or any image you drop in) as live ASCII art on a
 * canvas. Animation runs on the published site; the Framer canvas draws a
 * single representative frame to keep editing fast.
 *
 * @framerIntrinsicWidth 960
 * @framerIntrinsicHeight 260
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 */
export default function VektaAsciiLogo(props: Partial<Props>) {
    const {
        image,
        alt = DEFAULTS.alt,
        invert = DEFAULTS.invert,
        logoScale = DEFAULTS.logoScale,
        columns = DEFAULTS.columns,
        charSet = DEFAULTS.charSet,
        contrast = DEFAULTS.contrast,
        charScale = DEFAULTS.charScale,
        backgroundColor = DEFAULTS.backgroundColor,
        textColor = DEFAULTS.textColor,
        gradient = DEFAULTS.gradient,
        textColorEnd = DEFAULTS.textColorEnd,
        fadeDim = DEFAULTS.fadeDim,
        glow = DEFAULTS.glow,
        effect = DEFAULTS.effect,
        speed = DEFAULTS.speed,
        intensity = DEFAULTS.intensity,
        revealLoop = DEFAULTS.revealLoop,
        cursorGlow = DEFAULTS.cursorGlow,
        style,
    } = props

    const containerRef = React.useRef<HTMLDivElement>(null)
    const canvasRef = React.useRef<HTMLCanvasElement>(null)
    const pointerRef = React.useRef({ x: -999, y: -999, strength: 0, target: 0 })

    const isStatic = useIsStaticRenderer()
    const isEditing = RenderTarget.current() === RenderTarget.canvas

    const source =
        (typeof image === "string" ? image : image?.src) || VEKTA_LOGO_URI

    const [size, setSize] = React.useState({ width: 0, height: 0 })
    const [bitmap, setBitmap] = React.useState<HTMLImageElement | null>(null)
    const [reducedMotion, setReducedMotion] = React.useState(false)

    React.useEffect(() => {
        const query = window.matchMedia("(prefers-reduced-motion: reduce)")
        const sync = () => setReducedMotion(query.matches)
        sync()
        query.addEventListener("change", sync)
        return () => query.removeEventListener("change", sync)
    }, [])

    React.useEffect(() => {
        const element = containerRef.current
        if (!element) return
        const measure = () => {
            const rect = element.getBoundingClientRect()
            const width = Math.max(0, Math.round(rect.width))
            const height = Math.max(0, Math.round(rect.height))
            setSize((prev) =>
                prev.width === width && prev.height === height
                    ? prev
                    : { width, height }
            )
        }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    React.useEffect(() => {
        let cancelled = false
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
            if (!cancelled) setBitmap(img)
        }
        img.onerror = () => {
            if (!cancelled) setBitmap(null)
        }
        img.src = source
        return () => {
            cancelled = true
        }
    }, [source])

    const cols = Math.max(8, Math.round(columns))
    const cell = size.width > 0 ? size.width / cols : 0
    const rows = cell > 0 ? Math.max(2, Math.round(size.height / cell)) : 0

    /** Brightness per grid cell, 0–1. Only resampled when the fit changes. */
    const field = React.useMemo(() => {
        if (!bitmap || !bitmap.width || !bitmap.height || rows < 2) return null
        const sampler = document.createElement("canvas")
        sampler.width = cols
        sampler.height = rows
        const ctx = sampler.getContext("2d", { willReadFrequently: true })
        if (!ctx) return null

        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = "high"
        const fit =
            Math.min(cols / bitmap.width, rows / bitmap.height) * logoScale
        const drawWidth = bitmap.width * fit
        const drawHeight = bitmap.height * fit
        ctx.drawImage(
            bitmap,
            (cols - drawWidth) / 2,
            (rows - drawHeight) / 2,
            drawWidth,
            drawHeight
        )

        const { data } = ctx.getImageData(0, 0, cols, rows)
        const out = new Float32Array(cols * rows)
        for (let i = 0; i < out.length; i++) {
            const o = i * 4
            let luma =
                (0.2126 * data[o] +
                    0.7152 * data[o + 1] +
                    0.0722 * data[o + 2]) /
                255
            if (invert) luma = 1 - luma
            let value = luma * (data[o + 3] / 255)
            if (contrast !== 1) value = (value - 0.5) * contrast + 0.5
            out[i] = value < 0 ? 0 : value > 1 ? 1 : value
        }
        return out
    }, [bitmap, cols, rows, logoScale, invert, contrast])

    /**
     * Blurred copy of the field. Sweep effects are added through this so the
     * travelling band hugs the letterforms instead of banding the whole frame.
     */
    const halo = React.useMemo(() => {
        if (!field || rows < 2) return null
        const r = 3
        const span = r * 2 + 1
        const pass = new Float32Array(cols * rows)
        const out = new Float32Array(cols * rows)
        const clampX = (x: number) => (x < 0 ? 0 : x > cols - 1 ? cols - 1 : x)
        const clampY = (y: number) => (y < 0 ? 0 : y > rows - 1 ? rows - 1 : y)

        for (let y = 0; y < rows; y++) {
            const row = y * cols
            let sum = 0
            for (let x = -r; x <= r; x++) sum += field[row + clampX(x)]
            for (let x = 0; x < cols; x++) {
                pass[row + x] = sum / span
                sum += field[row + clampX(x + r + 1)] - field[row + clampX(x - r)]
            }
        }

        let peak = 0
        for (let x = 0; x < cols; x++) {
            let sum = 0
            for (let y = -r; y <= r; y++) sum += pass[clampY(y) * cols + x]
            for (let y = 0; y < rows; y++) {
                const value = sum / span
                out[y * cols + x] = value
                if (value > peak) peak = value
                sum +=
                    pass[clampY(y + r + 1) * cols + x] -
                    pass[clampY(y - r) * cols + x]
            }
        }
        if (peak > 0) for (let i = 0; i < out.length; i++) out[i] /= peak
        return out
    }, [field, cols, rows])

    React.useEffect(() => {
        if (isStatic || !cursorGlow || isEditing) return
        const element = containerRef.current
        if (!element) return
        const onMove = (event: PointerEvent) => {
            const rect = element.getBoundingClientRect()
            const cellSize = rect.width / cols
            if (!cellSize) return
            const pointer = pointerRef.current
            pointer.x = (event.clientX - rect.left) / cellSize
            pointer.y = (event.clientY - rect.top) / cellSize
            pointer.target = 1
        }
        const onLeave = () => {
            pointerRef.current.target = 0
        }
        element.addEventListener("pointermove", onMove)
        element.addEventListener("pointerleave", onLeave)
        return () => {
            element.removeEventListener("pointermove", onMove)
            element.removeEventListener("pointerleave", onLeave)
            pointerRef.current.target = 0
        }
    }, [cursorGlow, cols, isEditing, isStatic])

    React.useEffect(() => {
        if (isStatic) return
        const canvas = canvasRef.current
        if (
            !canvas ||
            !field ||
            !halo ||
            rows < 2 ||
            size.width < 1 ||
            size.height < 1
        ) {
            return
        }
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const chars = (charSet.length > 1 ? charSet : DEFAULT_CHARS).split("")
        const levels = Math.min(chars.length - 1, 255)
        const { width, height } = size
        const cellWidth = width / cols
        const cellHeight = height / rows
        const fontSize = Math.min(cellWidth, cellHeight) * charScale

        const colGain = new Float32Array(cols)
        const colAdd = new Float32Array(cols)
        const colScramble = new Uint8Array(cols)
        const indices = new Uint8Array(cols * rows)

        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)

        const paint: string | CanvasGradient = gradient
            ? (() => {
                  const ramp = ctx.createLinearGradient(0, 0, width, 0)
                  ramp.addColorStop(0, textColor)
                  ramp.addColorStop(1, textColorEnd)
                  return ramp
              })()
            : textColor

        const cursorRadius = 9
        const cursorRadiusSq = cursorRadius * cursorRadius

        const draw = (elapsed: number) => {
            const t = elapsed * speed

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            ctx.globalAlpha = 1
            ctx.clearRect(0, 0, width, height)
            ctx.fillStyle = backgroundColor
            ctx.fillRect(0, 0, width, height)

            colGain.fill(1)
            colAdd.fill(0)
            colScramble.fill(0)

            if (effect === "scan") {
                const head = ((t / 2.8) % 1) * 1.45 - 0.22
                for (let x = 0; x < cols; x++) {
                    const d = (x / (cols - 1) - head) / 0.13
                    const g = Math.exp(-d * d)
                    colGain[x] = 1 + intensity * 1.2 * g
                    colAdd[x] = intensity * 0.3 * g
                }
            } else if (effect === "pulse") {
                colGain.fill(1 + intensity * 0.28 * Math.sin(t * 2.2))
            } else if (effect === "reveal") {
                const sweep = 2
                const localT = revealLoop ? t % (sweep + 2.4) : t
                const progress = Math.min(localT / sweep, 1)
                if (progress < 1) {
                    const head = progress * 1.06 - 0.03
                    for (let x = 0; x < cols; x++) {
                        const p = x / (cols - 1)
                        if (p > head + 0.045) {
                            colGain[x] = 0
                        } else if (p > head - 0.05) {
                            colGain[x] = 1 + intensity * 0.9
                            colScramble[x] = 1
                        }
                    }
                }
            }

            const shimmer = effect === "shimmer" ? intensity * 0.4 : 0
            const shimmerStep = Math.floor(t * 14)
            const scrambleStep = Math.floor(t * 30)

            const pointer = pointerRef.current
            pointer.strength += (pointer.target - pointer.strength) * 0.12
            const reach = pointer.strength > 0.002 ? pointer.strength : 0

            for (let y = 0; y < rows; y++) {
                const row = y * cols
                for (let x = 0; x < cols; x++) {
                    const i = row + x
                    const base = field[i]
                    const near = halo[i] * halo[i]
                    let value = base * colGain[x] + colAdd[x] * near

                    if (shimmer > 0) {
                        const n = NOISE[(x * 31 + y * 17 + shimmerStep) & 4095]
                        value *= 1 - shimmer + 2 * shimmer * n
                    }
                    if (reach > 0) {
                        const dx = x - pointer.x
                        const dy = y - pointer.y
                        const falloff =
                            cursorRadiusSq / (cursorRadiusSq + dx * dx + dy * dy)
                        value += reach * 0.8 * falloff * (0.3 + value)
                    }

                    if (colScramble[x] && base > 0.02) {
                        const n = NOISE[(i * 7 + scrambleStep) & 4095]
                        indices[i] = 1 + Math.floor(n * levels)
                        continue
                    }
                    indices[i] =
                        value <= 0
                            ? 0
                            : value >= 1
                              ? levels
                              : Math.round(value * levels)
                }
            }

            ctx.font = `bold ${fontSize}px ${MONO_STACK}`
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillStyle = paint

            // One style change per density level instead of one per character.
            for (let level = 1; level <= levels; level++) {
                ctx.globalAlpha = fadeDim ? 0.28 + 0.72 * (level / levels) : 1
                const char = chars[level]
                for (let y = 0; y < rows; y++) {
                    const row = y * cols
                    const posY = y * cellHeight + cellHeight / 2
                    for (let x = 0; x < cols; x++) {
                        if (indices[row + x] !== level) continue
                        ctx.fillText(
                            char,
                            x * cellWidth + cellWidth / 2,
                            posY
                        )
                    }
                }
            }
            ctx.globalAlpha = 1
        }

        const animated =
            !isEditing && !reducedMotion && (effect !== "none" || cursorGlow)
        if (!animated) {
            const previewTime = effect === "reveal" ? 2.2 : 1.15
            draw(previewTime / Math.max(speed, 0.01))
            return
        }

        let frame = 0
        let start = 0
        const tick = (now: number) => {
            if (!start) start = now
            draw((now - start) / 1000)
            frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
    }, [
        field,
        halo,
        cols,
        rows,
        size,
        charSet,
        charScale,
        backgroundColor,
        textColor,
        textColorEnd,
        gradient,
        fadeDim,
        effect,
        speed,
        intensity,
        revealLoop,
        cursorGlow,
        isEditing,
        isStatic,
        reducedMotion,
    ])

    const shell: React.CSSProperties = {
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        backgroundColor,
        ...style,
    }

    // The static renderer has no canvas, so publish the plain logo as first paint.
    if (isStatic) {
        return (
            <div
                style={{
                    ...shell,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <img
                    src={source}
                    alt={alt}
                    style={{
                        maxWidth: `${logoScale * 100}%`,
                        maxHeight: `${logoScale * 100}%`,
                        objectFit: "contain",
                        opacity: 0.85,
                    }}
                />
            </div>
        )
    }

    return (
        <div ref={containerRef} style={shell} role="img" aria-label={alt}>
            <canvas
                ref={canvasRef}
                style={{
                    width: "100%",
                    height: "100%",
                    display: "block",
                    filter:
                        glow > 0
                            ? `drop-shadow(0 0 ${glow}px ${textColor})`
                            : undefined,
                }}
            />
        </div>
    )
}

addPropertyControls(VektaAsciiLogo, {
    image: {
        type: ControlType.Image,
        title: "Logo",
        description: "Leave empty to use the built-in Vekta lockup.",
    },
    invert: {
        type: ControlType.Boolean,
        title: "Invert",
        description: "Turn on for dark artwork on a light background.",
        defaultValue: DEFAULTS.invert,
    },
    logoScale: {
        type: ControlType.Number,
        title: "Logo Size",
        min: 0.2,
        max: 1,
        step: 0.01,
        displayStepper: false,
        defaultValue: DEFAULTS.logoScale,
    },
    effect: {
        type: ControlType.Enum,
        title: "Effect",
        options: ["scan", "shimmer", "reveal", "pulse", "none"],
        optionTitles: ["Scan", "Shimmer", "Reveal", "Pulse", "None"],
        defaultValue: DEFAULTS.effect,
    },
    speed: {
        type: ControlType.Number,
        title: "Speed",
        min: 0.1,
        max: 3,
        step: 0.1,
        defaultValue: DEFAULTS.speed,
        hidden: (props) => props.effect === "none",
    },
    intensity: {
        type: ControlType.Number,
        title: "Intensity",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: DEFAULTS.intensity,
        hidden: (props) => props.effect === "none",
    },
    revealLoop: {
        type: ControlType.Boolean,
        title: "Replay",
        defaultValue: DEFAULTS.revealLoop,
        hidden: (props) => props.effect !== "reveal",
    },
    cursorGlow: {
        type: ControlType.Boolean,
        title: "Cursor",
        description: "Characters brighten around the pointer.",
        defaultValue: DEFAULTS.cursorGlow,
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: DEFAULTS.backgroundColor,
    },
    textColor: {
        type: ControlType.Color,
        title: "Ink",
        defaultValue: DEFAULTS.textColor,
    },
    gradient: {
        type: ControlType.Boolean,
        title: "Gradient",
        defaultValue: DEFAULTS.gradient,
    },
    textColorEnd: {
        type: ControlType.Color,
        title: "Ink End",
        defaultValue: DEFAULTS.textColorEnd,
        hidden: (props) => !props.gradient,
    },
    fadeDim: {
        type: ControlType.Boolean,
        title: "Soft Edges",
        description: "Fades low-density characters for smoother edges.",
        defaultValue: DEFAULTS.fadeDim,
    },
    glow: {
        type: ControlType.Number,
        title: "Glow",
        min: 0,
        max: 40,
        step: 1,
        unit: "px",
        defaultValue: DEFAULTS.glow,
    },
    columns: {
        type: ControlType.Number,
        title: "Resolution",
        min: 40,
        max: 280,
        step: 2,
        defaultValue: DEFAULTS.columns,
    },
    charSet: {
        type: ControlType.String,
        title: "Characters",
        description: "Darkest to brightest. Start with a space.",
        defaultValue: DEFAULTS.charSet,
    },
    contrast: {
        type: ControlType.Number,
        title: "Contrast",
        min: 0.5,
        max: 5,
        step: 0.1,
        defaultValue: DEFAULTS.contrast,
    },
    charScale: {
        type: ControlType.Number,
        title: "Char Size",
        min: 0.8,
        max: 2.4,
        step: 0.1,
        defaultValue: DEFAULTS.charScale,
    },
    alt: {
        type: ControlType.String,
        title: "Alt Text",
        defaultValue: DEFAULTS.alt,
    },
})
