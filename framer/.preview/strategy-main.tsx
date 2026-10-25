import React from "react"
import { createRoot } from "react-dom/client"
import StrategyOverview from "../StrategyOverview"

function Frame(props: {
    title: string
    width: number
    height?: number
    theme?: "light" | "dark"
    autoPlay?: boolean
    previewProgress?: number
}) {
    return (
        <div>
            <h2>
                {props.title} · {props.width}
                {props.height ? `×${props.height}` : " auto"}
            </h2>
            <div className="frame" style={{ width: props.width, height: props.height }}>
                <StrategyOverview
                    theme={props.theme}
                    autoPlay={props.autoPlay ?? false}
                    previewProgress={props.previewProgress}
                />
            </div>
        </div>
    )
}

createRoot(document.getElementById("root")!).render(
    <>
        <div className="row">
            <Frame title="Light completed" width={620} height={520} />
            <Frame title="Hero width" width={540} />
            <Frame title="Narrow" width={340} />
            <Frame title="Recommendation" width={620} previewProgress={0.42} />
            <Frame title="Actions" width={620} previewProgress={0.62} />
        </div>
        <div className="dark-page">
            <div className="row">
                <Frame title="Dark completed" width={620} height={520} theme="dark" />
                <Frame title="Playing" width={560} autoPlay />
            </div>
        </div>
    </>
)
