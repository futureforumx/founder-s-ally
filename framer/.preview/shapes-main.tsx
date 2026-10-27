import React from "react"
import { createRoot } from "react-dom/client"
import MapStrands from "../MapStrands"

const all = ["live", "data", "network"] as const
type Mark = (typeof all)[number]

const requested = new URLSearchParams(window.location.search).get("mark")
const marks: Mark[] = all.includes(requested as Mark) ? [requested as Mark] : [...all]

createRoot(document.getElementById("root")!).render(
    <div className="grid" style={{ gridTemplateColumns: `repeat(${marks.length}, 1fr)` }}>
        {marks.map((mark) => (
            <div className="cell" key={mark}>
                <div className="label">{mark}</div>
                <MapStrands mark={mark} />
            </div>
        ))}
    </div>
)
