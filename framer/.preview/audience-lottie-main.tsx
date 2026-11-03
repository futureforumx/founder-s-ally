import React from "react"
import { createRoot } from "react-dom/client"
import { AudienceLottie } from "../AudienceLottie"

const items = [
    { shape: "institutional", stat: "20k", label: "Institutional investors" },
    { shape: "investors", stat: "60k", label: "Investor profiles" },
    { shape: "founders", stat: "100k", label: "Startup profiles" },
    { shape: "operators", stat: "400k", label: "Founder and operator profiles" },
] as const

const requested = new URLSearchParams(window.location.search).get("shape")
const shown = items.filter((item) => !requested || item.shape === requested)

createRoot(document.getElementById("root")!).render(
    <div
        style={{
            minHeight: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#000",
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        }}
    >
        <div
            style={{
                display: "grid",
                gridTemplateColumns: `repeat(${shown.length}, minmax(180px, 1fr))`,
                gap: 48,
                width: "min(1100px, 92vw)",
            }}
        >
            {shown.map((item) => (
                <div
                    key={item.shape}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 28,
                    }}
                >
                    <div style={{ width: 64, height: 64 }}>
                        <AudienceLottie
                            shape={item.shape}
                            playing
                            loop
                            pauseOnCanvas={false}
                            isForwardsDirection
                            speed={1}
                            style={{ width: 64, height: 64 }}
                        />
                    </div>
                    <div>
                        <div
                            style={{
                                color: "#fafafa",
                                fontSize: 40,
                                fontWeight: 500,
                                letterSpacing: "-0.04em",
                                lineHeight: 1,
                            }}
                        >
                            {item.stat}
                        </div>
                        <div
                            style={{
                                marginTop: 10,
                                color: "#a1a1a1",
                                fontSize: 16,
                                lineHeight: 1.3,
                            }}
                        >
                            {item.label}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    </div>
)
