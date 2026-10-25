import React from "react"
import * as THREE from "three"

type Session = {
    halted: () => boolean
    shouldStop: () => boolean
    ready: () => void
    end: () => void
    attach: (renderer: THREE.WebGLRenderer) => void
}

export function useWebGLGuards(_label: string) {
    const beginSession = (): Session => {
        let stopped = false
        let renderer: THREE.WebGLRenderer | null = null
        return {
            halted: () => stopped,
            shouldStop: () => stopped || Boolean(renderer?.getContext()?.isContextLost()),
            ready: () => {},
            end: () => {
                stopped = true
            },
            attach: (next) => {
                renderer = next
            },
        }
    }

    return { webglAvailable: true, gpuEpoch: 0, beginSession }
}

export function createGuardedRenderer(
    session: Session,
    options: {
        params?: { antialias?: boolean; alpha?: boolean }
        requirements?: {
            vertexTextures?: boolean
            floatDataTextures?: boolean
            floatRenderTargets?: boolean
            maxTextureSize?: number
        }
    }
) {
    let renderer: THREE.WebGLRenderer
    try {
        renderer = new THREE.WebGLRenderer({
            antialias: options.params?.antialias ?? true,
            alpha: options.params?.alpha ?? true,
            powerPreference: "high-performance",
        })
    } catch {
        return null
    }

    const gl = renderer.getContext()
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    const needed = options.requirements?.maxTextureSize ?? 0
    if (needed > maxTexture) {
        renderer.dispose()
        return null
    }

    if (options.requirements?.vertexTextures) {
        const units = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) as number
        if (!units) {
            renderer.dispose()
            return null
        }
    }

    session.attach(renderer)
    return {
        renderer,
        detach() {},
    }
}

export function WebGLFallbackFrame({
    mountRef,
    showFallback,
    fallbackImage,
    fallbackFit = "cover",
    fallbackAlt = "",
}: {
    mountRef: React.RefObject<HTMLDivElement | null>
    showFallback: boolean
    fallbackImage?: string
    fallbackFit?: "cover" | "contain" | "fill"
    fallbackAlt?: string
}) {
    const src = typeof fallbackImage === "string" ? fallbackImage : undefined
    return (
        <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
            <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
            {showFallback && src ? (
                <img
                    src={src}
                    alt={fallbackAlt}
                    style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: fallbackFit,
                    }}
                />
            ) : null}
        </div>
    )
}

export const fallbackPropertyControls = {
    fallbackImage: {
        title: "Fallback Image",
        type: "image",
    },
    fallbackFit: {
        title: "Fallback Fit",
        type: "enum",
        options: ["cover", "contain", "fill"],
        defaultValue: "cover",
    },
    fallbackAlt: {
        title: "Fallback Alt",
        type: "string",
        defaultValue: "",
    },
}

export type FallbackProps = {
    fallbackImage?: string
    fallbackFit?: "cover" | "contain" | "fill"
    fallbackAlt?: string
}
