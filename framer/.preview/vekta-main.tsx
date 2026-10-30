import React from "react"
import { createRoot } from "react-dom/client"
import Vekta from "../Vekta"

createRoot(document.getElementById("root")!).render(
    <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
        <Vekta />
    </div>
)
