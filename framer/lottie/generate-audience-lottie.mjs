import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const dir = dirname(fileURLToPath(import.meta.url))
const shapes = ["institutional", "investors", "founders", "operators"]
const data = Object.fromEntries(
    shapes.map((key) => [key, JSON.parse(readFileSync(join(dir, `${key}.json`), "utf8"))])
)

const file = `// Get Started: https://www.framer.com/developers

import * as React from "react"
import { useRef, useCallback, useEffect } from "react"
import { motion, addPropertyControls, ControlType, RenderTarget } from "framer"
import { defaultEvents } from "https://framer.com/m/framer/default-utils.js@^0.45.0"
import lottie from "https://jspm.dev/lottie-web@5.7.8"

const SHAPES = ${JSON.stringify(data)}

/**
 * Audience Lottie — four 64px stat marks from the Data capabilities page.
 * Institutional is a capsule, Investors two ticks, Founders three lines,
 * Operators three vertical ticks. Paste into Framer; pick Shape.
 *
 * @framerIntrinsicWidth 200
 * @framerIntrinsicHeight 200
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 */
export function AudienceLottie(props) {
    const {
        style,
        shape,
        playing,
        loop,
        pauseOnCanvas,
        isForwardsDirection,
        speed,
        onClick,
        onMouseEnter,
        onMouseLeave,
        onMouseDown,
        onMouseUp,
    } = props

    const isOnCanvas = RenderTarget.current() === RenderTarget.canvas
    const shouldPlay = (!pauseOnCanvas || !isOnCanvas) && playing
    const direction = isForwardsDirection ? 1 : -1

    const el = useRef(null)
    const animationInfo = useRef({
        animation: null,
    })

    const play = () => animationInfo.current?.animation?.play()
    const pause = () => animationInfo.current?.animation?.pause()
    const destroy = () => animationInfo.current?.animation?.destroy()

    const setup = useCallback(() => {
        if (!el.current) return
        destroy()

        const anim = (animationInfo.current.animation = lottie.loadAnimation({
            container: el.current,
            renderer: "svg",
            loop,
            autoplay: shouldPlay,
            animationData: SHAPES[shape] || SHAPES.institutional,
            rendererSettings: {
                preserveAspectRatio: "xMidYMid meet",
            },
        }))

        anim.setDirection(direction)
        anim.setSpeed(speed)

        return () => {
            anim.destroy()
        }
    }, [shape, loop, shouldPlay, speed, direction])

    useEffect(() => {
        return setup()
    }, [setup])

    useEffect(() => lottie.setQuality(isOnCanvas ? "low" : "medium"), [])

    useEffect(() => {
        if (!animationInfo.current?.animation) return
        animationInfo.current.animation.setSpeed(speed)
    }, [speed])

    useEffect(() => {
        if (!animationInfo.current?.animation) return
        animationInfo.current.animation.setDirection(direction)
    }, [direction])

    useEffect(() => {
        if (shouldPlay) play()
        else pause()
    }, [shouldPlay])

    return (
        <motion.div
            ref={el}
            style={style}
            {...{ onClick, onMouseEnter, onMouseLeave, onMouseDown, onMouseUp }}
        />
    )
}

AudienceLottie.defaultProps = {
    height: 64,
    width: 64,
    shape: "institutional",
    pauseOnCanvas: true,
    playing: true,
    loop: true,
    isForwardsDirection: true,
    speed: 1,
}

addPropertyControls(AudienceLottie, {
    shape: {
        type: ControlType.Enum,
        title: "Shape",
        options: ["institutional", "investors", "founders", "operators"],
        optionTitles: ["Institutional", "Investors", "Founders", "Operators"],
        displaySegmentedControl: true,
    },
    playing: {
        type: ControlType.Boolean,
        title: "Playing",
        enabledTitle: "Yes",
        disabledTitle: "No",
    },
    pauseOnCanvas: {
        type: ControlType.Boolean,
        title: "Canvas",
        disabledTitle: "Play",
        enabledTitle: "Pause",
        hidden: (props) => props.playing === false,
    },
    loop: {
        type: ControlType.Boolean,
        title: "Loop",
        enabledTitle: "Yes",
        disabledTitle: "No",
    },
    isForwardsDirection: {
        title: "Direction",
        type: ControlType.Boolean,
        enabledTitle: "Normal",
        disabledTitle: "Reverse",
    },
    speed: {
        type: ControlType.Number,
        defaultValue: 1,
        min: 0,
        max: 10,
        step: 0.5,
        displayStepper: true,
        unit: "x",
    },
    ...defaultEvents,
})
`

writeFileSync(join(dir, "../AudienceLottie.tsx"), file)
console.log("wrote AudienceLottie.tsx", (Buffer.byteLength(file) / 1024).toFixed(1), "kb")
