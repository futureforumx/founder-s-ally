import React from "react"
import { createRoot } from "react-dom/client"
import AtlasIntelligenceShowcase from "../AtlasIntelligenceShowcase"

function Frame(props: {
    title: string
    width: number
    height?: number
    autoPlay?: boolean
    previewProgress?: number
}) {
    return (
        <div data-frame={props.title}>
            <h2>
                {props.title} · {props.width}
                {props.height ? `×${props.height}` : " auto"}
            </h2>
            <div className="frame" style={{ width: props.width, height: props.height }}>
                <AtlasIntelligenceShowcase autoPlay={props.autoPlay ?? false} previewProgress={props.previewProgress} />
            </div>
        </div>
    )
}

createRoot(document.getElementById("root")!).render(
    <div className="row">
        <Frame title="1200" width={1200} height={620} />
        <Frame title="900" width={900} height={620} />
        <Frame title="600" width={600} />
        <Frame title="375" width={375} />
        <Frame title="mid" width={1200} height={620} previewProgress={0.45} />
        <Frame title="recommend" width={1200} height={620} previewProgress={0.7} />
        <Frame title="playing" width={1200} height={620} autoPlay />
    </div>
)
