import React from "react"
import { createRoot } from "react-dom/client"
import Ask from "../Ask"

const shapeParam = new URLSearchParams(window.location.search).get("shape")
const shapes = ["map", "dataroom", "live", "network", "investor", "person", "cloud"] as const
type Shape = (typeof shapes)[number]
const shape: Shape = shapes.includes(shapeParam as Shape) ? (shapeParam as Shape) : "map"

createRoot(document.getElementById("root")!).render(
    <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
        <Ask shape={shape} />
    </div>
)
