import React from "react"
import { createRoot } from "react-dom/client"
import FileAnalytics from "../FileAnalytics"

const params = new URLSearchParams(window.location.search)
const sceneParam = params.get("scene")
const scene = Number(sceneParam || 0)
const pin = sceneParam !== null && Number.isFinite(scene)

createRoot(document.getElementById("root")!).render(
    <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
        <FileAnalytics
            autoPlay={!pin}
            previewShape={pin ? scene : 0}
        />
    </div>
)
