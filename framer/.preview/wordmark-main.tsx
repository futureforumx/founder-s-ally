import React from "react"
import { createRoot } from "react-dom/client"
import Wordmark from "../Wordmark"

createRoot(document.getElementById("root")!).render(
    <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
        <Wordmark />
    </div>
)
