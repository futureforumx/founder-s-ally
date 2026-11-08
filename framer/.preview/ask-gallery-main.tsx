import React from "react"
import { createRoot } from "react-dom/client"
import Ask from "../Ask"

const shapes = ["wordmark", "map", "dataroom", "live", "network", "investor", "person"] as const

createRoot(document.getElementById("root")!).render(
    <div
        style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 16,
            padding: 24,
            minHeight: "100vh",
            background: "#000",
            boxSizing: "border-box",
        }}
    >
        {shapes.map((shape) => (
            <div
                key={shape}
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    gridColumn: shape === "wordmark" ? "1 / -1" : undefined,
                }}
            >
                <div
                    style={{
                        color: "#8a8a8a",
                        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                        fontSize: 12,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                    }}
                >
                    {shape}
                </div>
                <div
                    style={{
                        width: "100%",
                        aspectRatio: shape === "wordmark" ? "2.4 / 1" : "1 / 1",
                        background: "#000",
                        border: "1px solid rgba(255,255,255,0.08)",
                    }}
                >
                    <Ask shape={shape} />
                </div>
            </div>
        ))}
    </div>
)
