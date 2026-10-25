import React from "react"
import { createRoot } from "react-dom/client"
import CompanyIntelligence from "../CompanyIntelligence"

function Frame(props: { title: string; width: number; height: number; autoPlay?: boolean; previewTime?: number }) {
    return (
        <div>
            <h2>
                {props.title} · {props.width}×{props.height}
            </h2>
            <div className="frame" style={{ width: props.width, height: props.height }}>
                <CompanyIntelligence autoPlay={props.autoPlay ?? false} previewTime={props.previewTime} />
            </div>
        </div>
    )
}

createRoot(document.getElementById("root")!).render(
    <div className="row">
        <Frame title="Completed" width={760} height={440} />
        <Frame title="Sources" width={760} height={440} previewTime={900} />
        <Frame title="Flow" width={760} height={440} previewTime={2500} />
        <Frame title="Analysis" width={760} height={440} previewTime={5300} />
        <Frame title="Hold" width={760} height={440} previewTime={6600} />
        <Frame title="Wide" width={980} height={440} />
        <Frame title="Short" width={760} height={320} />
        <Frame title="Narrow completed" width={360} height={440} />
        <Frame title="Narrow flow" width={360} height={440} previewTime={2500} />
        <Frame title="Playing" width={760} height={440} autoPlay />
    </div>
)
