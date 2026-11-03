import React from "react"
import { createRoot } from "react-dom/client"
import AudienceField from "../AudienceField"

const shapes = ["institutional", "investors", "founders", "operators"] as const
const labels = {
    institutional: "Institutional",
    investors: "Investors",
    founders: "Founders",
    operators: "Operators",
}

const requested = new URLSearchParams(window.location.search).get("shape")
const shown = shapes.includes(requested as (typeof shapes)[number])
    ? [requested as (typeof shapes)[number]]
    : [...shapes]

createRoot(document.getElementById("root")!).render(
    <div className="grid" style={{ gridTemplateColumns: shown.length === 1 ? "1fr" : "1fr 1fr" }}>
        {shown.map((shape) => (
            <div className="cell" key={shape}>
                <div className="label">{labels[shape]}</div>
                <AudienceField shape={shape} />
            </div>
        ))}
    </div>
)
