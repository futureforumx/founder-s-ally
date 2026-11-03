import React from "react"

/** Local stand-in for Framer's PointMorph — a quiet field, not the full strand sim. */
export default function PointMorph({ style }: { style?: React.CSSProperties }) {
    return (
        <div
            aria-hidden="true"
            style={{
                width: "min(72vmin, 720px)",
                height: "min(72vmin, 720px)",
                borderRadius: "50%",
                background:
                    "radial-gradient(circle at 45% 40%, rgba(91,92,255,0.22), rgba(46,230,166,0.06) 42%, transparent 70%)",
                filter: "blur(2px)",
                pointerEvents: "none",
                ...style,
            }}
        />
    )
}
