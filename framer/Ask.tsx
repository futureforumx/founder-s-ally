// Get Started: https://www.framer.com/developers

import { addPropertyControls, ControlType } from "framer"
import { useSpring, useMotionValue, type MotionValue } from "framer-motion"
import React, { useRef, useEffect, useMemo } from "react"
import * as THREE from "three"
import {
    useWebGLGuards,
    createGuardedRenderer,
    WebGLFallbackFrame,
    fallbackPropertyControls,
    FallbackProps,
} from "https://framer.com/m/WebGLGuard-XiTZOn.js@EpoSZrLQNfZYaMsptJAQ#WebGLFallbackFrame"

const DEG2RAD = Math.PI / 180
const QUAD_VERTS = 4

/**
 * Ask particle marks — same GPU motion as meetvekta.com/features/ai-agent (noise drift,
 * gather/scatter, cursor parting). Shape picks an outline (stroke, not fill): folded map,
 * data-room bars, live, network, investor, person, vekta wordmark, or cloud.
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 */
export default function Ask({
    shape = "map",
    points = "",
    threshold = 1,
    scale = 1,
    cloudSpread = 0.008,
    tipLayers = 2,
    tipRadius = 0.0036,
    springSettings = { duration: 3000, bounce: 0.2 },
    noiseStrength = 0.032,
    noiseScale = 5.0,
    cameraFov = 36,
    cameraPosition = { x: 0, y: 0, z: 1.8 },
    cameraRotationX = 0,
    cameraRotationY = 0,
    sizeVariance = 0.48,
    particleOpacity = 0.9,
    simRadius = 0.28,
    simStrength = 9,
    simSpring = 10,
    simDamping = 2.8,
    simMaxVelocity = 3.8,
    opacitySpeed = 1.4,
    maxDelay = 0.45,
    highlightRadius = 0.35,
    highlightStrength = 1.35,
    highlightSpeed = 8,
    pulseStrength = 0.9,
    pulseSpeedBase = 0.08,
    pulseSpeedRandomMax = 0.16,
    groupPeriod = 16,
    groupTight = 0.96,
    groupStagger = 0.14,
    speedVariance = 0.55,
    streakStrength = 1.35,
    chromaticStrength = 0.4,
    markOpacity = 0,
    tipTexture,
    fallbackImage,
    fallbackFit = "cover",
    fallbackAlt = "",
}: Props) {
    const mountRef = useRef<HTMLDivElement>(null)
    const materialRef = useRef<THREE.ShaderMaterial | null>(null)
    const loaderRef = useRef<THREE.TextureLoader>(new THREE.TextureLoader())
    const tipTextureRef = useRef<THREE.Texture | null>(null)

    const { webglAvailable, gpuEpoch, beginSession } = useWebGLGuards("Ask")

    const { positions, numSources } = useMemo(
        () => parsePoints(points, threshold, shape),
        [points, threshold, shape]
    )

    const springOptions = {
        duration: springSettings.duration,
        bounce: springSettings.bounce,
    }

    const tipRadiusS = useSpringed(tipRadius, springOptions)
    const noiseStrengthS = useSpringed(noiseStrength, springOptions)
    const noiseScaleS = useSpringed(noiseScale, springOptions)
    const cameraFovS = useSpringed(cameraFov, springOptions)
    const cameraPositionXS = useSpringed(cameraPosition.x, springOptions)
    const cameraPositionYS = useSpringed(cameraPosition.y, springOptions)
    const cameraPositionZS = useSpringed(cameraPosition.z, springOptions)
    const cameraRotationXS = useSpringed(cameraRotationX, springOptions)
    const cameraRotationYS = useSpringed(cameraRotationY, springOptions)
    const sizeVarianceS = useSpringed(sizeVariance, springOptions)
    const particleOpacityS = useSpringed(particleOpacity, springOptions)
    const simRadiusS = useSpringed(simRadius, springOptions)
    const simStrengthS = useSpringed(simStrength, springOptions)
    const simSpringS = useSpringed(simSpring, springOptions)
    const simDampingS = useSpringed(simDamping, springOptions)
    const simMaxVelocityS = useSpringed(simMaxVelocity, springOptions)
    const opacitySpeedS = useSpringed(opacitySpeed, springOptions)
    const maxDelayS = useSpringed(maxDelay, springOptions)
    const highlightRadiusS = useSpringed(highlightRadius, springOptions)
    const highlightStrengthS = useSpringed(highlightStrength, springOptions)
    const highlightSpeedS = useSpringed(highlightSpeed, springOptions)
    const pulseStrengthS = useSpringed(pulseStrength, springOptions)
    const pulseSpeedBaseS = useSpringed(pulseSpeedBase, springOptions)
    const pulseSpeedRandomMaxS = useSpringed(pulseSpeedRandomMax, springOptions)
    const groupPeriodS = useSpringed(groupPeriod, springOptions)
    const groupTightS = useSpringed(groupTight, springOptions)
    const groupStaggerS = useSpringed(groupStagger, springOptions)
    const speedVarianceS = useSpringed(speedVariance, springOptions)

    useEffect(() => {
        const el = mountRef.current
        if (!el || !positions) return

        const session = beginSession()
        const cluster = Math.max(1, Math.round(tipLayers))
        const totalParticles = numSources * cluster
        const simSize = Math.ceil(Math.sqrt(totalParticles))
        const simAtlasHeight = simSize * 2
        const dataAtlasHeight = simSize * 3

        const gpu = createGuardedRenderer(session, {
            params: { antialias: true, alpha: true },
            requirements: {
                vertexTextures: true,
                floatDataTextures: true,
                floatRenderTargets: true,
                maxTextureSize: Math.max(simSize, simAtlasHeight, dataAtlasHeight),
            },
        })
        if (!gpu) return
        const renderer = gpu.renderer

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(el.clientWidth, el.clientHeight)
        renderer.setClearColor(0x000000, 0)
        el.appendChild(renderer.domElement)
        const domElement = renderer.domElement
        domElement.style.display = "block"
        domElement.style.width = "100%"
        domElement.style.height = "100%"

        const scene = new THREE.Scene()
        const cameraParent = new THREE.Object3D()
        scene.add(cameraParent)

        const camera = new THREE.PerspectiveCamera(
            cameraFovS.get(),
            el.clientWidth / el.clientHeight,
            0.1,
            100
        )
        camera.position.set(cameraPositionXS.get(), cameraPositionYS.get(), cameraPositionZS.get())
        cameraParent.add(camera)
        cameraParent.rotation.x = cameraRotationXS.get() * DEG2RAD
        cameraParent.rotation.y = cameraRotationYS.get() * DEG2RAD

        const totalVerts = totalParticles * QUAD_VERTS
        const totalIndices = totalParticles * 6

        const ATLAS_POS = new THREE.Vector4(1.0, 0.5, 0.0, 0.0)
        const ATLAS_VEL = new THREE.Vector4(1.0, 0.5, 0.0, 0.5)
        const DATA_TARGET = new THREE.Vector4(1.0, 1 / 3, 0.0, 0.0)
        const DATA_START = new THREE.Vector4(1.0, 1 / 3, 0.0, 1 / 3)
        const DATA_HIGHLIGHT_REF = new THREE.Vector4(1.0, 1 / 3, 0.0, 2 / 3)

        function cellToUV(cellIdx: number): [number, number] {
            const x = ((cellIdx % simSize) + 0.5) / simSize
            const y = (Math.floor(cellIdx / simSize) + 0.5) / simSize
            return [x, y]
        }

        const posAttr = new Float32Array(totalVerts * 3)
        const aRandom = new Float32Array(totalVerts * 2)
        const aUV = new Float32Array(totalVerts * 3)
        const aSimCell = new Float32Array(totalVerts * 2)
        const indices = new Uint32Array(totalIndices)

        const dataTexData = new Float32Array(simSize * dataAtlasHeight * 4)
        const cellsPerSection = simSize * simSize
        const TARGET_OFFSET = 0
        const START_OFFSET = cellsPerSection
        const HREF_OFFSET = cellsPerSection * 2
        const spread = cloudSpread
        const quadUVCorners = [0, 0, 1, 0, 0, 1, 1, 1]

        let pointCursor = 0
        let indexCursor = 0

        for (let si = 0; si < numSources; si++) {
            const sx = positions[si * 3] * scale
            const sy = positions[si * 3 + 1] * scale
            const sz = positions[si * 3 + 2] * scale

            for (let p = 0; p < cluster; p++) {
                const cellIdx = si * cluster + p
                const [uvX, uvY] = cellToUV(cellIdx)
                const r0 = hash(si, p, 1)
                const r1 = hash(si, p, 2)
                const r2 = hash(si, p, 3)
                const rStagger = hash(si, p, 4)
                const jitter = 0.35 + r2 * 0.9
                const tx = sx + gauss(r0, r1) * spread * jitter
                const ty = sy + gauss(r1, r2) * spread * jitter * 0.78
                const tz = sz + gauss(r2, r0) * spread * jitter * 0.62

                dataTexData[(TARGET_OFFSET + cellIdx) * 4] = tx
                dataTexData[(TARGET_OFFSET + cellIdx) * 4 + 1] = ty
                dataTexData[(TARGET_OFFSET + cellIdx) * 4 + 2] = tz
                dataTexData[(TARGET_OFFSET + cellIdx) * 4 + 3] = 1

                dataTexData[(START_OFFSET + cellIdx) * 4] = tx
                dataTexData[(START_OFFSET + cellIdx) * 4 + 1] = ty
                dataTexData[(START_OFFSET + cellIdx) * 4 + 2] = tz
                dataTexData[(START_OFFSET + cellIdx) * 4 + 3] = rStagger

                dataTexData[(HREF_OFFSET + cellIdx) * 4] = tx
                dataTexData[(HREF_OFFSET + cellIdx) * 4 + 1] = ty
                dataTexData[(HREF_OFFSET + cellIdx) * 4 + 2] = tz
                dataTexData[(HREF_OFFSET + cellIdx) * 4 + 3] = hash(si, p, 5)

                const quadVertBase = cellIdx * QUAD_VERTS
                for (let q = 0; q < QUAD_VERTS; q++) {
                    const v = pointCursor * 3
                    const a = pointCursor * 2
                    const u = pointCursor * 3
                    posAttr[v] = tx
                    posAttr[v + 1] = ty
                    posAttr[v + 2] = tz
                    aRandom[a] = r0
                    aRandom[a + 1] = r1
                    aUV[u] = quadUVCorners[q * 2]
                    aUV[u + 1] = quadUVCorners[q * 2 + 1]
                    aUV[u + 2] = r2
                    aSimCell[a] = uvX
                    aSimCell[a + 1] = uvY
                    pointCursor++
                }

                indices[indexCursor++] = quadVertBase + 0
                indices[indexCursor++] = quadVertBase + 2
                indices[indexCursor++] = quadVertBase + 1
                indices[indexCursor++] = quadVertBase + 2
                indices[indexCursor++] = quadVertBase + 3
                indices[indexCursor++] = quadVertBase + 1
            }
        }

        const dataTex = new THREE.DataTexture(
            dataTexData,
            simSize,
            dataAtlasHeight,
            THREE.RGBAFormat,
            THREE.FloatType
        )
        dataTex.minFilter = THREE.NearestFilter
        dataTex.magFilter = THREE.NearestFilter
        dataTex.needsUpdate = true

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute("position", new THREE.BufferAttribute(posAttr, 3))
        geometry.setAttribute("aRandom", new THREE.BufferAttribute(aRandom, 2))
        geometry.setAttribute("aUV", new THREE.BufferAttribute(aUV, 3))
        geometry.setAttribute("aSimCell", new THREE.BufferAttribute(aSimCell, 2))
        geometry.setIndex(new THREE.BufferAttribute(indices, 1))

        let rtRead = new THREE.WebGLRenderTarget(simSize, simAtlasHeight, {
            type: THREE.HalfFloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
        })
        let rtWrite = rtRead.clone()

        const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
        const simGeo = new THREE.PlaneGeometry(2, 2)

        const seedMat = new THREE.ShaderMaterial({
            uniforms: {
                tData: { value: dataTex },
                uAtlasPos: { value: ATLAS_POS.clone() },
                uAtlasVel: { value: ATLAS_VEL.clone() },
                uDataTarget: { value: DATA_TARGET.clone() },
                uGroupTight: { value: groupTightS.get() },
            },
            vertexShader: /* glsl */ `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                uniform sampler2D tData;
                uniform vec4 uAtlasPos;
                uniform vec4 uAtlasVel;
                uniform vec4 uDataTarget;
                uniform float uGroupTight;
                varying vec2 vUv;

                vec2 atlasUV(vec2 cellUv, vec4 region) {
                    return cellUv * region.xy + region.zw;
                }
                vec2 cellUVfromAtlas(vec2 atlasUv, vec4 region) {
                    return (atlasUv - region.zw) / region.xy;
                }

                void main() {
                    bool isVelocity = vUv.y >= uAtlasVel.w;
                    if (isVelocity) {
                        gl_FragColor = vec4(0.0);
                        return;
                    }
                    vec2 cellUv = cellUVfromAtlas(vUv, uAtlasPos);
                    vec3 home = texture2D(tData, atlasUV(cellUv, uDataTarget)).rgb;
                    gl_FragColor = vec4(home * uGroupTight, 0.0);
                }
            `,
        })
        const seedScene = new THREE.Scene()
        seedScene.add(new THREE.Mesh(simGeo, seedMat))
        renderer.setRenderTarget(rtRead)
        renderer.render(seedScene, simCamera)
        renderer.setRenderTarget(rtWrite)
        renderer.render(seedScene, simCamera)
        renderer.setRenderTarget(null)
        seedScene.clear()
        seedMat.dispose()

        const simScene = new THREE.Scene()
        const simMat = new THREE.ShaderMaterial({
            uniforms: {
                tPrev: { value: rtRead.texture },
                tData: { value: dataTex },
                uMouse: { value: new THREE.Vector2(0, 0) },
                uDelta: { value: 0 },
                uRadius: { value: simRadiusS.get() },
                uStrength: { value: simStrengthS.get() },
                uSpring: { value: simSpringS.get() },
                uDamping: { value: simDampingS.get() },
                uMaxVelocity: { value: simMaxVelocityS.get() },
                uHighlightRadius: { value: highlightRadiusS.get() },
                uHighlightSpeed: { value: highlightSpeedS.get() },
                uOpacitySpeed: { value: opacitySpeedS.get() },
                uElapsed: { value: 0 },
                uMaxDelay: { value: maxDelayS.get() },
                uGroupRate: { value: 1 / Math.max(groupPeriodS.get(), 0.2) },
                uGroupTight: { value: groupTightS.get() },
                uGroupStagger: { value: groupStaggerS.get() },
                uSpeedVariance: { value: speedVarianceS.get() },
                uAtlasPos: { value: ATLAS_POS.clone() },
                uAtlasVel: { value: ATLAS_VEL.clone() },
                uDataTarget: { value: DATA_TARGET.clone() },
                uDataStart: { value: DATA_START.clone() },
                uDataHighlightRef: { value: DATA_HIGHLIGHT_REF.clone() },
            },
            vertexShader: /* glsl */ `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                uniform sampler2D tPrev;
                uniform sampler2D tData;
                uniform vec2  uMouse;
                uniform float uDelta;
                uniform float uRadius;
                uniform float uStrength;
                uniform float uSpring;
                uniform float uDamping;
                uniform float uMaxVelocity;
                uniform float uHighlightRadius;
                uniform float uHighlightSpeed;
                uniform float uOpacitySpeed;
                uniform float uElapsed;
                uniform float uMaxDelay;
                uniform float uGroupRate;
                uniform float uGroupTight;
                uniform float uGroupStagger;
                uniform float uSpeedVariance;
                uniform vec4  uAtlasPos;
                uniform vec4  uAtlasVel;
                uniform vec4  uDataTarget;
                uniform vec4  uDataStart;
                uniform vec4  uDataHighlightRef;
                const float ACTIVATE_EASE = 0.55;
                const float SANE_SQ = 1.0e8;
                const float MAX_SPRING_STEP = 2.0;
                varying vec2 vUv;

                vec2 atlasUV(vec2 cellUv, vec4 region) {
                    return cellUv * region.xy + region.zw;
                }
                vec2 cellUVfromAtlas(vec2 atlasUv, vec4 region) {
                    return (atlasUv - region.zw) / region.xy;
                }

                void main() {
                    bool isVelocity = vUv.y >= uAtlasVel.w;
                    vec2 cellUv = isVelocity
                        ? cellUVfromAtlas(vUv, uAtlasVel)
                        : cellUVfromAtlas(vUv, uAtlasPos);

                    vec4 posData  = texture2D(tPrev, atlasUV(cellUv, uAtlasPos));
                    vec3 pos      = posData.rgb;
                    float opacity = posData.a;
                    vec4 velData    = texture2D(tPrev, atlasUV(cellUv, uAtlasVel));
                    vec3 vel        = velData.rgb;
                    float highlight = velData.a;

                    vec4 homeData     = texture2D(tData, atlasUV(cellUv, uDataTarget));
                    vec3 home         = homeData.rgb;
                    vec4 hrefData     = texture2D(tData, atlasUV(cellUv, uDataHighlightRef));
                    vec3 highlightRef = hrefData.rgb;
                    float rSpeed      = hrefData.a;
                    float rStagger    = texture2D(tData, atlasUV(cellUv, uDataStart)).a;

                    if (!(dot(pos, pos) < SANE_SQ)) { pos = home * uGroupTight; vel = vec3(0.0); }
                    if (!(dot(vel, vel) < SANE_SQ)) vel = vec3(0.0);
                    if (!(opacity >= 0.0)) opacity = 0.0;
                    if (!(highlight >= 0.0)) highlight = 0.0;

                    float strandDelay = rStagger * uMaxDelay;
                    float activeT = clamp((uElapsed - strandDelay) / ACTIVATE_EASE, 0.0, 1.0);

                    float phase = fract(uElapsed * uGroupRate - rStagger * uGroupStagger);
                    float ungroup = smoothstep(0.28, 0.48, phase) * (1.0 - smoothstep(0.68, 0.9, phase));
                    vec3 grouped = home * uGroupTight;
                    vec3 targetPos = mix(grouped, home, ungroup);

                    float tempo = mix(1.0, mix(0.18, 1.85, pow(rSpeed, 0.62)), uSpeedVariance);

                    vec2 toCell   = pos.xy - uMouse;
                    float dist    = length(toCell);
                    float repulse = 1.0 - smoothstep(0.0, uRadius, dist);
                    vec2 repelDir = dist > 0.0001 ? toCell / dist : vec2(0.0, 1.0);
                    vel.xy       += repelDir * repulse * uStrength * uDelta * tempo;

                    float cap = uMaxVelocity * mix(0.45, 1.7, tempo * 0.5);
                    float speed = length(vel);
                    if (speed > cap) vel = vel / speed * cap;

                    float springStep = min(uSpring * tempo * uDelta, MAX_SPRING_STEP);
                    vel -= (pos - targetPos) * springStep * activeT;
                    vel *= exp(-uDamping * mix(1.55, 0.55, tempo * 0.5) * uDelta);

                    pos     += vel * uDelta;
                    opacity += (activeT - opacity) * clamp(uOpacitySpeed * uDelta, 0.0, 1.0);
                    opacity  = clamp(opacity, 0.0, 1.0);

                    float tipDist = length(uMouse - highlightRef.xy);
                    float target  = 1.0 - smoothstep(0.0, uHighlightRadius, tipDist);
                    highlight = mix(highlight, target, clamp(uHighlightSpeed * uDelta, 0.0, 1.0));
                    highlight = clamp(highlight, 0.0, 1.0);

                    gl_FragColor = isVelocity ? vec4(vel, highlight) : vec4(pos, opacity);
                }
            `,
        })
        simScene.add(new THREE.Mesh(simGeo, simMat))

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uNoiseStrength: { value: noiseStrengthS.get() },
                uNoiseScale: { value: noiseScaleS.get() },
                uTipRadius: { value: tipRadiusS.get() },
                uTipTexture: { value: tipTextureRef.current },
                uHasTexture: { value: tipTextureRef.current ? 1 : 0 },
                uSizeVariance: { value: sizeVarianceS.get() },
                uParticleOpacity: { value: particleOpacityS.get() },
                uHighlightStrength: { value: highlightStrengthS.get() },
                uPulseStrength: { value: pulseStrengthS.get() },
                uPulseSpeedBase: { value: pulseSpeedBaseS.get() },
                uPulseSpeedRandomMax: { value: pulseSpeedRandomMaxS.get() },
                uStreakStrength: { value: streakStrength },
                uChromaticStrength: { value: chromaticStrength },
                tSim: { value: rtRead.texture },
                uAtlasPos: { value: ATLAS_POS.clone() },
                uAtlasVel: { value: ATLAS_VEL.clone() },
            },
            vertexShader: /* glsl */ `
#define OCTAVES 2

vec3 rand(in vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yxz + 19.19);
    return fract((p.xxy + p.yxx) * p.zyx) * 2.0 - 1.0;
}

vec3 quintic(const in vec3 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

float perlin(in vec3 xyz) {
    vec3 gridUV = fract(xyz);
    vec3 gridID = floor(xyz);
    vec3 c000=vec3(0,0,0); vec3 c100=vec3(1,0,0);
    vec3 c010=vec3(0,1,0); vec3 c110=vec3(1,1,0);
    vec3 c001=vec3(0,0,1); vec3 c101=vec3(1,0,1);
    vec3 c011=vec3(0,1,1); vec3 c111=vec3(1,1,1);
    float r000=dot(gridUV-c000,rand(gridID+c000)); float r100=dot(gridUV-c100,rand(gridID+c100));
    float r010=dot(gridUV-c010,rand(gridID+c010)); float r110=dot(gridUV-c110,rand(gridID+c110));
    float r001=dot(gridUV-c001,rand(gridID+c001)); float r101=dot(gridUV-c101,rand(gridID+c101));
    float r011=dot(gridUV-c011,rand(gridID+c011)); float r111=dot(gridUV-c111,rand(gridID+c111));
    vec3 f=quintic(gridUV);
    float x0=mix(r000,r100,f.x); float x1=mix(r010,r110,f.x);
    float x2=mix(r001,r101,f.x); float x3=mix(r011,r111,f.x);
    float y0=mix(x0,x1,f.y); float y1=mix(x2,x3,f.y);
    return mix(y0,y1,f.z)*2.0;
}

float fractalBrownian(const in vec3 xyz, const in float ampWeight) {
    float result=0.0; float amp=1.0; float freq=1.0; float maxAmp=0.0;
    for(int i=0;i<OCTAVES;i++){
        result+=amp*perlin(xyz*freq); maxAmp+=amp; amp*=ampWeight; freq*=2.0;
    }
    return result/maxAmp;
}

attribute vec2  aRandom;
attribute vec3  aUV;
attribute vec2  aSimCell;

uniform float uTime;
uniform float uNoiseStrength;
uniform float uNoiseScale;
uniform float uTipRadius;
uniform float uSizeVariance;
uniform float uStreakStrength;
uniform sampler2D tSim;
uniform vec4  uAtlasPos;
uniform vec4  uAtlasVel;

varying vec2  vRandom;
varying vec3  vUV;
varying float vHighlight;
varying float vOpacity;

vec2 atlasUV(vec2 cellUv, vec4 region) {
    return cellUv * region.xy + region.zw;
}

void main() {
    vRandom = aRandom;
    vUV     = aUV;

    vec4 posData  = texture2D(tSim, atlasUV(aSimCell, uAtlasPos));
    vec3 worldPos = posData.rgb;
    vOpacity      = posData.a;
    vHighlight    = texture2D(tSim, atlasUV(aSimCell, uAtlasVel)).a;

    if (!(dot(worldPos, worldPos) < 1.0e8)) {
        gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
        vOpacity = 0.0;
        return;
    }
    if (!(vOpacity >= 0.0)) vOpacity = 0.0;
    if (!(vHighlight >= 0.0)) vHighlight = 0.0;

    float nSpeed = mix(0.22, 1.65, aRandom.x);
    float swirl = 0.045 * sin(uTime * 0.16 + worldPos.z * 3.4);
    vec3 drifted = worldPos;
    drifted.xy += vec2(-worldPos.y, worldPos.x) * swirl;
    drifted.x += 0.04 * sin(uTime * 0.11 + worldPos.y * 2.8);
    drifted.y += 0.028 * cos(uTime * 0.09 + worldPos.x * 2.2);

    vec3 coords = drifted * uNoiseScale
        + uTime * vec3(0.035, 0.014, 0.048) * nSpeed
        + aRandom.yxy * 2.4;

    float dx = fractalBrownian(coords, 0.5);
    float dy = fractalBrownian(coords + vec3(3.963, 1.053, 5.263), 0.5);
    float dz = fractalBrownian(coords + vec3(7.1, 2.4, 1.8), 0.5);
    vec3 displacedPos = drifted + vec3(dx, dy, dz) * uNoiseStrength;

    vec3 vel = texture2D(tSim, atlasUV(aSimCell, uAtlasVel)).rgb;
    if (!(dot(vel, vel) < 1.0e8)) vel = vec3(0.0);
    vec4 centerView = modelViewMatrix * vec4(displacedPos, 1.0);
    float sv = mix(1.0 - uSizeVariance, 1.0, aRandom.y);
    float breath = 0.88 + 0.12 * sin(uTime * 0.35 + aRandom.x * 6.28318);
    // Filament axis from noise field (always on) blended with sim velocity.
    vec2 noiseFlow = vec2(dx, dy);
    float noiseLen = length(noiseFlow);
    vec2 swirlDir = normalize(vec2(-displacedPos.y, displacedPos.x) + vec2(0.0001));
    vec2 flow = noiseLen > 1e-4 ? noiseFlow : swirlDir;
    flow = mix(flow, vel.xy, 0.35);
    float flowLen = length(flow);
    vec2 flowDir = flowLen > 1e-5 ? flow / flowLen : swirlDir;
    vec2 flowPerp = vec2(-flowDir.y, flowDir.x);
    float streak = (1.15 + noiseLen * 2.4 + flowLen * 1.2) * uStreakStrength;
    float ox = (aUV.x - 0.5) * 2.0 * uTipRadius * sv * breath;
    float oy = (aUV.y - 0.5) * -2.0 * uTipRadius * sv * breath * (1.0 + streak);
    vec2 local = flowPerp * ox + (-flowDir) * oy;
    centerView.xy += local;
    gl_Position = projectionMatrix * centerView;
}
`,
            fragmentShader: /* glsl */ `
uniform float uTime;
uniform float uParticleOpacity;
uniform float uHighlightStrength;
uniform float uPulseStrength;
uniform float uPulseSpeedBase;
uniform float uPulseSpeedRandomMax;
uniform float uChromaticStrength;
uniform float uHasTexture;
uniform sampler2D uTipTexture;

varying vec2  vRandom;
varying vec3  vUV;
varying float vHighlight;
varying float vOpacity;

void main() {
    vec2 centered = vUV.xy - vec2(0.5);
    float r = length(centered) * 2.0;
    if (r > 1.15) discard;

    // Soft elliptical falloff so streaked quads still read as hair filaments.
    float aspect = 1.0 + uChromaticStrength * 0.35;
    float rr = length(centered * vec2(1.0, aspect)) * 2.0;
    float core = exp(-rr * rr * 8.4);
    float halo = exp(-rr * rr * 1.35) * 0.62;
    float falloff = core + halo;
    if (falloff < 0.01) discard;

    float twinkleSpeed = uPulseSpeedBase + vRandom.x * uPulseSpeedRandomMax;
    float twinkle = 0.78 + 0.22 * sin(uTime * twinkleSpeed * 6.28318 + vRandom.y * 11.0);

    // Prismatic white — mostly silver, with faint RGB fringe like the reference.
    vec3 base = vec3(0.92, 0.93, 0.98);
    vec3 cool = vec3(0.55, 0.78, 1.0);
    vec3 warm = vec3(1.0, 0.72, 0.55);
    vec3 tint = mix(base, mix(cool, warm, vRandom.y), 0.18 + 0.22 * uChromaticStrength);
    float fringe = uChromaticStrength * (0.035 + 0.04 * vRandom.x);
    tint.r += fringe * sin(vRandom.x * 6.28318);
    tint.b += fringe * cos(vRandom.y * 6.28318);
    tint.g -= fringe * 0.35;

    vec3 tex = vec3(1.0);
    if (uHasTexture > 0.5) {
        tex = texture2D(uTipTexture, vUV.xy).xyz;
    }

    float glow = (0.88 + vHighlight * uHighlightStrength * 0.35) * mix(0.82, 1.0, twinkle * uPulseStrength);
    float a = clamp(falloff * vOpacity * uParticleOpacity * mix(0.28, 0.98, vRandom.x) * glow, 0.0, 1.0);
    vec3 color = tint * tex * (0.7 + core * 1.55);
    gl_FragColor = vec4(clamp(color, 0.0, 1.0) * a, a);
}
`,
            transparent: true,
            depthTest: false,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
            blendEquationAlpha: THREE.AddEquation,
            blendSrcAlpha: THREE.OneFactor,
            blendDstAlpha: THREE.OneFactor,
        })
        materialRef.current = material

        const pointsMesh = new THREE.Mesh(geometry, material)
        pointsMesh.rotateX(Math.PI)
        scene.add(pointsMesh)
        pointsMesh.updateWorldMatrix(true, false)
        const meshWorldInverse = pointsMesh.matrixWorld.clone().invert()

        let isPageVisible = document.visibilityState === "visible"
        let isIntersecting = false

        const maybeResume = () => {
            if (session.halted()) {
                renderer.setAnimationLoop(null)
                return
            }
            if (isPageVisible && isIntersecting) renderer.setAnimationLoop(tick)
            else renderer.setAnimationLoop(null)
        }

        const handleVisibility = () => {
            isPageVisible = document.visibilityState === "visible"
            maybeResume()
        }
        document.addEventListener("visibilitychange", handleVisibility)

        const MOUSE_AWAY = -9999
        const mouseScreen = new THREE.Vector2(MOUSE_AWAY, MOUSE_AWAY)
        const _unprojected = new THREE.Vector3()
        const _rayOrigin = new THREE.Vector3()
        const _rayDir = new THREE.Vector3()
        const _planeNormal = new THREE.Vector3()
        const _mouseHit = new THREE.Vector3()

        const onMouseMove = (e: MouseEvent) => {
            const rect = el.getBoundingClientRect()
            mouseScreen.set(e.clientX - rect.left, e.clientY - rect.top)
        }
        const onMouseLeave = () => {
            mouseScreen.set(MOUSE_AWAY, MOUSE_AWAY)
        }
        el.addEventListener("mousemove", onMouseMove)
        el.addEventListener("mouseleave", onMouseLeave)

        let previousTime = 0
        let elapsed = 0

        function tick(time: number) {
            if (session.shouldStop()) return

            const t = time * 0.001
            const delta = Math.min(t - previousTime, 0.1)
            previousTime = t
            elapsed += delta

            camera.fov = cameraFovS.get()
            camera.updateProjectionMatrix()
            camera.position.set(cameraPositionXS.get(), cameraPositionYS.get(), cameraPositionZS.get())
            cameraParent.rotation.x = cameraRotationXS.get() * DEG2RAD
            cameraParent.rotation.y = cameraRotationYS.get() * DEG2RAD
            camera.updateWorldMatrix(true, false)

            const W = el.clientWidth
            const H = el.clientHeight

            if (mouseScreen.x <= MOUSE_AWAY) {
                simMat.uniforms.uMouse.value.set(MOUSE_AWAY, MOUSE_AWAY)
            } else {
                const ndcX = (mouseScreen.x / W) * 2 - 1
                const ndcY = -((mouseScreen.y / H) * 2 - 1)
                _unprojected
                    .set(ndcX, ndcY, 0.5)
                    .applyMatrix4(camera.projectionMatrixInverse)
                    .applyMatrix4(camera.matrixWorld)
                _rayOrigin.setFromMatrixPosition(camera.matrixWorld)
                _rayDir.copy(_unprojected).sub(_rayOrigin).normalize()
                camera.getWorldDirection(_planeNormal)
                const hit = -_planeNormal.dot(_rayOrigin) / _planeNormal.dot(_rayDir)
                _mouseHit.copy(_rayOrigin).addScaledVector(_rayDir, hit).applyMatrix4(meshWorldInverse)
                simMat.uniforms.uMouse.value.set(_mouseHit.x, _mouseHit.y)
            }

            simMat.uniforms.tPrev.value = rtRead.texture
            simMat.uniforms.uDelta.value = delta
            simMat.uniforms.uRadius.value = simRadiusS.get()
            simMat.uniforms.uStrength.value = simStrengthS.get()
            simMat.uniforms.uSpring.value = simSpringS.get()
            simMat.uniforms.uDamping.value = simDampingS.get()
            simMat.uniforms.uMaxVelocity.value = simMaxVelocityS.get()
            simMat.uniforms.uHighlightRadius.value = highlightRadiusS.get()
            simMat.uniforms.uHighlightSpeed.value = highlightSpeedS.get()
            simMat.uniforms.uOpacitySpeed.value = opacitySpeedS.get()
            simMat.uniforms.uElapsed.value = elapsed
            simMat.uniforms.uMaxDelay.value = maxDelayS.get()
            simMat.uniforms.uGroupRate.value = 1 / Math.max(groupPeriodS.get(), 0.2)
            simMat.uniforms.uGroupTight.value = groupTightS.get()
            simMat.uniforms.uGroupStagger.value = groupStaggerS.get()
            simMat.uniforms.uSpeedVariance.value = speedVarianceS.get()

            renderer.setRenderTarget(rtWrite)
            renderer.render(simScene, simCamera)
            renderer.setRenderTarget(null)

            const tmp = rtRead
            rtRead = rtWrite
            rtWrite = tmp

            material.uniforms.tSim.value = rtRead.texture
            material.uniforms.uTime.value = t
            material.uniforms.uNoiseStrength.value = noiseStrengthS.get()
            material.uniforms.uNoiseScale.value = noiseScaleS.get()
            material.uniforms.uTipRadius.value = tipRadiusS.get()
            material.uniforms.uSizeVariance.value = sizeVarianceS.get()
            material.uniforms.uParticleOpacity.value = particleOpacityS.get()
            material.uniforms.uHighlightStrength.value = highlightStrengthS.get()
            material.uniforms.uPulseStrength.value = pulseStrengthS.get()
            material.uniforms.uPulseSpeedBase.value = pulseSpeedBaseS.get()
            material.uniforms.uPulseSpeedRandomMax.value = pulseSpeedRandomMaxS.get()
            material.uniforms.uStreakStrength.value = streakStrength
            material.uniforms.uChromaticStrength.value = chromaticStrength
            material.uniforms.uHasTexture.value = tipTextureRef.current ? 1 : 0
            material.uniforms.uTipTexture.value = tipTextureRef.current

            renderer.render(scene, camera)
        }

        const ro = new ResizeObserver(() => {
            camera.aspect = el.clientWidth / el.clientHeight
            camera.updateProjectionMatrix()
            renderer.setSize(el.clientWidth, el.clientHeight)
        })
        ro.observe(el)

        const io = new IntersectionObserver(
            ([entry]) => {
                isIntersecting = entry.isIntersecting
                maybeResume()
            },
            { threshold: 0 }
        )
        io.observe(el)

        session.ready()

        return () => {
            session.end()
            gpu.detach()
            el.removeEventListener("mousemove", onMouseMove)
            el.removeEventListener("mouseleave", onMouseLeave)
            renderer.setAnimationLoop(null)
            ro.disconnect()
            io.disconnect()
            materialRef.current = null
            document.removeEventListener("visibilitychange", handleVisibility)
            scene.clear()
            geometry.dispose()
            material.dispose()
            dataTex.dispose()
            rtRead.dispose()
            rtWrite.dispose()
            simGeo.dispose()
            simMat.dispose()
            renderer.dispose()
            if (el.contains(domElement)) el.removeChild(domElement)
            setTimeout(() => renderer.forceContextLoss(), 1)
        }
    }, [
        positions,
        numSources,
        scale,
        cloudSpread,
        tipLayers,
        streakStrength,
        chromaticStrength,
        gpuEpoch,
    ])

    useEffect(() => {
        if (!tipTexture) {
            tipTextureRef.current?.dispose()
            tipTextureRef.current = null
            if (materialRef.current) {
                materialRef.current.uniforms.uTipTexture.value = null
                materialRef.current.uniforms.uHasTexture.value = 0
            }
            return
        }
        return loadTexture(loaderRef.current, tipTexture, (t) => {
            tipTextureRef.current?.dispose()
            tipTextureRef.current = t
            if (materialRef.current) {
                materialRef.current.uniforms.uTipTexture.value = t
                materialRef.current.uniforms.uHasTexture.value = 1
            }
        })
    }, [tipTexture])

    return (
        <div style={shell}>
            <WebGLFallbackFrame
                mountRef={mountRef}
                showFallback={!webglAvailable || !positions}
                fallbackImage={fallbackImage}
                fallbackFit={fallbackFit}
                fallbackAlt={fallbackAlt}
            />
            <VektaMark opacity={markOpacity} />
        </div>
    )
}

function useSpringed(value: number, options: { duration: number; bounce: number }): MotionValue<number> {
    const mv = useMotionValue(value)
    const sprung = useSpring(mv, options)
    useEffect(() => {
        mv.set(value)
    }, [mv, value])
    return sprung
}

function parsePoints(
    str: string,
    threshold = 1,
    shape: Shape = "map"
): { positions: number[] | null; numSources: number } {
    if (!str || !str.trim()) return buildShapeField(shape)
    const values = str.split(",").map(Number)
    if (values.length < 2 || values.length % 2 !== 0) return buildShapeField(shape)
    if (values.some(isNaN)) return buildShapeField(shape)
    const out: number[] = []
    for (let i = 0; i < values.length / 2; i++) {
        if (Math.random() > threshold) continue
        out.push(values[i * 2], values[i * 2 + 1], 0)
    }
    if (out.length === 0) return { positions: null, numSources: 0 }
    return { positions: out, numSources: out.length / 3 }
}

function buildShapeField(shape: Shape): { positions: number[]; numSources: number } {
    switch (shape) {
        case "cloud":
            return buildNebulaField(2200)
        case "dataroom":
            return buildDataRoomField(1400)
        case "live":
            return buildLiveField(1400)
        case "network":
            return buildNetworkField(1600)
        case "investor":
            return buildInvestorField(1600)
        case "person":
            return buildPersonField(1400)
        case "wordmark":
            return buildWordmarkField(2400)
        case "map":
        default:
            return buildFoldedMapField(1600)
    }
}

function worldFromDesign(x: number, y: number): [number, number] {
    const centerX = 349.5
    const centerY = 299.5
    const span = 485
    const target = 0.96
    return [((x - centerX) / span) * target, ((y - centerY) / span) * target]
}

function pushWorld(out: number[], x: number, y: number, seed: number, zScale = 0.03) {
    const [nx, ny] = worldFromDesign(x, y)
    out.push(nx, ny, (hash(seed, 3, 11) - 0.5) * zScale)
}

/** Densely sample a polyline so particles form a thin stroke, not a fill. */
function samplePolyline(
    out: number[],
    pts: Array<[number, number]>,
    spacing: number,
    seedBase: number,
    closed = false
) {
    if (pts.length < 2) return
    const path = closed ? [...pts, pts[0]] : pts
    let seed = seedBase
    for (let i = 0; i < path.length - 1; i++) {
        const [x0, y0] = path[i]
        const [x1, y1] = path[i + 1]
        const dx = x1 - x0
        const dy = y1 - y0
        const len = Math.hypot(dx, dy)
        if (len < 1e-6) continue
        const steps = Math.max(1, Math.ceil(len / spacing))
        for (let s = 0; s < steps; s++) {
            const t = s / steps
            seed++
            const jx = (hash(seed, 1, 5) - 0.5) * spacing * 0.22
            const jy = (hash(seed, 2, 5) - 0.5) * spacing * 0.22
            pushWorld(out, x0 + dx * t + jx, y0 + dy * t + jy, seed)
        }
    }
}

function sampleCircleRing(
    out: number[],
    cx: number,
    cy: number,
    r: number,
    spacing: number,
    seedBase: number
) {
    const n = Math.max(12, Math.ceil((Math.PI * 2 * r) / spacing))
    const pts: Array<[number, number]> = []
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        pts.push([cx + Math.cos(a) * r, cy - Math.sin(a) * r])
    }
    samplePolyline(out, pts, spacing, seedBase, true)
}

function sampleArcRing(
    out: number[],
    cx: number,
    cy: number,
    r: number,
    a0: number,
    a1: number,
    spacing: number,
    seedBase: number
) {
    let start = a0
    let end = a1
    while (end < start) end += Math.PI * 2
    const arcLen = (end - start) * r
    const n = Math.max(4, Math.ceil(arcLen / spacing))
    const pts: Array<[number, number]> = []
    for (let i = 0; i <= n; i++) {
        const a = start + ((end - start) * i) / n
        pts.push([cx + Math.cos(a) * r, cy - Math.sin(a) * r])
    }
    samplePolyline(out, pts, spacing, seedBase, false)
}

function sampleRoundedRectRing(
    out: number[],
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    r: number,
    spacing: number,
    seedBase: number
) {
    const rr = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2)
    const pts: Array<[number, number]> = [
        [x0 + rr, y0],
        [x1 - rr, y0],
    ]
    // top-right corner
    {
        const n = Math.max(3, Math.ceil((Math.PI * 0.5 * rr) / spacing))
        for (let i = 1; i <= n; i++) {
            const a = -Math.PI / 2 + (i / n) * (Math.PI / 2)
            pts.push([x1 - rr + Math.cos(a) * rr, y0 + rr + Math.sin(a) * rr])
        }
    }
    pts.push([x1, y1 - rr])
    // bottom-right
    {
        const n = Math.max(3, Math.ceil((Math.PI * 0.5 * rr) / spacing))
        for (let i = 1; i <= n; i++) {
            const a = 0 + (i / n) * (Math.PI / 2)
            pts.push([x1 - rr + Math.cos(a) * rr, y1 - rr + Math.sin(a) * rr])
        }
    }
    pts.push([x0 + rr, y1])
    // bottom-left
    {
        const n = Math.max(3, Math.ceil((Math.PI * 0.5 * rr) / spacing))
        for (let i = 1; i <= n; i++) {
            const a = Math.PI / 2 + (i / n) * (Math.PI / 2)
            pts.push([x0 + rr + Math.cos(a) * rr, y1 - rr + Math.sin(a) * rr])
        }
    }
    pts.push([x0, y0 + rr])
    // top-left
    {
        const n = Math.max(3, Math.ceil((Math.PI * 0.5 * rr) / spacing))
        for (let i = 1; i <= n; i++) {
            const a = Math.PI + (i / n) * (Math.PI / 2)
            pts.push([x0 + rr + Math.cos(a) * rr, y0 + rr + Math.sin(a) * rr])
        }
    }
    samplePolyline(out, pts, spacing, seedBase, true)
}

function subsample(out: number[], count: number): { positions: number[]; numSources: number } {
    const n = out.length / 3
    if (n <= count) return { positions: out, numSources: n }
    const trimmed: number[] = []
    for (let i = 0; i < count; i++) {
        const j = Math.floor((i / count) * n) * 3
        trimmed.push(out[j], out[j + 1], out[j + 2])
    }
    return { positions: trimmed, numSources: trimmed.length / 3 }
}

/**
 * Folded-map outline — panel perimeters + crease gutters + location pin.
 * Matches the stroke-style map mark (not a filled silhouette).
 */
function buildFoldedMapField(count: number): { positions: number[]; numSources: number } {
    const panels = [
        { x0: 107, x1: 248, lean: 1 as const },
        { x0: 286, x1: 413, lean: -1 as const },
        { x0: 451, x1: 592, lean: 1 as const },
    ]
    const top = 110
    const bottom = 489
    const slant = 50
    const spacing = 3.2
    const out: number[] = []

    const panelCorners = (panel: (typeof panels)[number]): Array<[number, number]> => {
        const width = panel.x1 - panel.x0
        const along = (x: number) => (panel.lean > 0 ? (x - panel.x0) / width : (panel.x1 - x) / width)
        const yTop = (x: number) => top + along(x) * slant
        const yBottom = (x: number) => bottom - slant + along(x) * slant
        return [
            [panel.x0, yTop(panel.x0)],
            [panel.x1, yTop(panel.x1)],
            [panel.x1, yBottom(panel.x1)],
            [panel.x0, yBottom(panel.x0)],
        ]
    }

    panels.forEach((panel, i) => samplePolyline(out, panelCorners(panel), spacing, 1000 + i * 97, true))

    // Crease gutters between panels
    for (let i = 0; i < panels.length - 1; i++) {
        const left = panels[i]
        const right = panels[i + 1]
        const mid = (left.x1 + right.x0) / 2
        const widthL = left.x1 - left.x0
        const alongL = left.lean > 0 ? 1 : 0
        const yTop = top + alongL * slant
        const yBottom = bottom - slant + alongL * slant
        samplePolyline(out, [[mid, yTop + 8], [mid, yBottom - 8]], spacing, 2000 + i * 41, false)
    }

    // Location pin on the right panel
    sampleCircleRing(out, 520, 300, 16, spacing * 0.9, 3000)

    return subsample(out, count)
}

/** Three stacked stadium bars — Data Room outlines. */
function buildDataRoomField(count: number): { positions: number[]; numSources: number } {
    const x0 = 107
    const x1 = 592
    const barH = 88
    const gap = 38
    const radius = 44
    const block = barH * 3 + gap * 2
    const top = 110 + (379 - block) / 2
    const spacing = 3.1
    const out: number[] = []
    for (let i = 0; i < 3; i++) {
        const y0 = top + i * (barH + gap)
        sampleRoundedRectRing(out, x0, y0, x1, y0 + barH, radius, spacing, 4000 + i * 113)
    }
    return subsample(out, count)
}

/** Center disc rim + paired broadcast arcs — Live outlines. */
function buildLiveField(count: number): { positions: number[]; numSources: number } {
    const cx = 349.5
    const cy = 299.5
    const hubR = 86
    const innerMid = 138
    const outerMid = 186
    const innerSweep = (52 * Math.PI) / 180
    const outerSweep = (70 * Math.PI) / 180
    const spacing = 3.0
    const out: number[] = []
    sampleCircleRing(out, cx, cy, hubR, spacing, 5000)
    for (const [mid, sweep, seed] of [
        [innerMid, innerSweep, 5100],
        [outerMid, outerSweep, 5200],
    ] as const) {
        sampleArcRing(out, cx, cy, mid, Math.PI - sweep, Math.PI + sweep, spacing, seed)
        sampleArcRing(out, cx, cy, mid, -sweep, sweep, spacing, seed + 50)
    }
    return subsample(out, count)
}

/** Hub-and-nodes graph — Network outlines (circle rims + link strokes). */
function buildNetworkField(count: number): { positions: number[]; numSources: number } {
    const cx = 349.5
    const cy = 299.5
    const hubR = 82
    const nodes = [
        { deg: 142, dist: 186, r: 64 },
        { deg: 180, dist: 176, r: 44 },
        { deg: 228, dist: 170, r: 34 },
        { deg: 50, dist: 168, r: 34 },
        { deg: 8, dist: 172, r: 44 },
        { deg: 322, dist: 186, r: 64 },
    ]
    const spacing = 3.0
    const out: number[] = []
    sampleCircleRing(out, cx, cy, hubR, spacing, 6000)
    nodes.forEach((node, i) => {
        const rad = (node.deg * Math.PI) / 180
        const nx = cx + node.dist * Math.cos(rad)
        const ny = cy - node.dist * Math.sin(rad)
        sampleCircleRing(out, nx, ny, node.r, spacing, 6100 + i * 37)
        const dx = nx - cx
        const dy = ny - cy
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len
        samplePolyline(
            out,
            [
                [cx + ux * (hubR + 1), cy + uy * (hubR + 1)],
                [nx - ux * (node.r + 1), ny - uy * (node.r + 1)],
            ],
            spacing,
            6200 + i * 53,
            false
        )
    })
    return subsample(out, count)
}

/** Investor mark — person outline with dollar strokes in the head. */
function buildInvestorField(count: number): { positions: number[]; numSources: number } {
    const cx = 349.5
    const cyHead = 210
    const headR = 95
    const sx0 = 200
    const sx1 = 499
    const sy0 = 330
    const sy1 = 470
    const sr = 70
    const spacing = 3.0
    const out: number[] = []
    sampleCircleRing(out, cx, cyHead, headR, spacing, 7000)
    sampleRoundedRectRing(out, sx0, sy0, sx1, sy1, sr, spacing, 7100)

    // Dollar stem + S body inside the head
    const stemTop = cyHead - 54
    const stemBot = cyHead + 54
    samplePolyline(out, [[cx, stemTop], [cx, stemBot]], spacing * 0.8, 7200, false)
    samplePolyline(out, [[cx - 12, stemTop + 4], [cx + 12, stemTop + 4]], spacing, 7210, false)
    samplePolyline(out, [[cx - 12, stemBot - 4], [cx + 12, stemBot - 4]], spacing, 7220, false)
    // Upper lobe opens left; lower lobe opens right (classic $)
    sampleArcRing(out, cx, cyHead - 18, 30, Math.PI * 0.15, Math.PI * 1.15, spacing * 0.85, 7230)
    sampleArcRing(out, cx, cyHead + 18, 30, Math.PI * 1.15, Math.PI * 2.15, spacing * 0.85, 7240)

    return subsample(out, count)
}

/** Person / agent mark — head + shoulders outlines only. */
function buildPersonField(count: number): { positions: number[]; numSources: number } {
    const cx = 349.5
    const cyHead = 210
    const headR = 95
    const sx0 = 200
    const sx1 = 499
    const sy0 = 330
    const sy1 = 470
    const sr = 70
    const spacing = 3.0
    const out: number[] = []
    sampleCircleRing(out, cx, cyHead, headR, spacing, 8000)
    sampleRoundedRectRing(out, sx0, sy0, sx1, sy1, sr, spacing, 8100)
    return subsample(out, count)
}

/**
 * Lowercase "vekta" wordmark — letter outlines from the brand hero SVG paths.
 * Framed so the longer side spans ~0.92 world units (same camera as other marks).
 */
function buildWordmarkField(count: number): { positions: number[]; numSources: number } {
    // Paths from public/brand/vekta-hero-wordmark.svg (group translate 295,85 + per-letter).
    const originX = 295
    const originY = 85
    const letters: Array<{ tx: number; ty: number; rings: Array<Array<[number, number]>> }> = [
        {
            tx: 0.0994388,
            ty: 241.814999,
            rings: [
                [
                    [75.765625, 0],
                    [1.578125, -185.21875],
                    [38.40625, -185.21875],
                    [88.34375, -54],
                    [138.03125, -185.21875],
                    [174.46875, -185.21875],
                    [100.671875, 0],
                ],
            ],
        },
        {
            tx: 191.439898,
            ty: 241.814999,
            rings: [
                [
                    [23.859375, 0],
                    [23.859375, -185.21875],
                    [147.078125, -185.21875],
                    [147.078125, -154.671875],
                    [57.15625, -154.671875],
                    [57.15625, -107.875],
                    [140.90625, -107.875],
                    [140.90625, -77.34375],
                    [57.15625, -77.34375],
                    [57.15625, -31.453125],
                    [147.078125, -31.453125],
                    [147.078125, 0],
                ],
            ],
        },
        {
            tx: 369.934692,
            ty: 241.814999,
            rings: [
                [
                    [23.859375, 0],
                    [23.859375, -185.21875],
                    [57.15625, -185.21875],
                    [57.15625, -88.609375],
                    [147.328125, -185.21875],
                    [191.90625, -185.21875],
                    [117.84375, -109.328125],
                    [193.34375, 0],
                    [151.921875, 0],
                    [94.765625, -87.03125],
                    [57.15625, -48.109375],
                    [57.15625, 0],
                ],
            ],
        },
        {
            tx: 580.674735,
            ty: 241.814999,
            rings: [
                [
                    [60.6875, 0],
                    [60.6875, -155.46875],
                    [2.625, -155.46875],
                    [2.625, -185.21875],
                    [151.921875, -185.21875],
                    [151.921875, -155.46875],
                    [93.984375, -155.46875],
                    [93.984375, 0],
                ],
            ],
        },
        {
            tx: 750.649419,
            ty: 241.814999,
            rings: [
                [
                    [1.578125, 0],
                    [75.765625, -185.21875],
                    [100.671875, -185.21875],
                    [174.46875, 0],
                    [138.546875, 0],
                    [124.265625, -40.234375],
                    [52.296875, -40.234375],
                    [37.875, 0],
                ],
                [
                    [63.578125, -68.6875],
                    [112.984375, -68.6875],
                    [88.34375, -136.328125],
                ],
            ],
        },
    ]

    const absRings: Array<Array<[number, number]>> = []
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const letter of letters) {
        for (const ring of letter.rings) {
            const abs: Array<[number, number]> = ring.map(([x, y]) => {
                const ax = originX + letter.tx + x
                const ay = originY + letter.ty + y
                if (ax < minX) minX = ax
                if (ax > maxX) maxX = ax
                if (ay < minY) minY = ay
                if (ay > maxY) maxY = ay
                return [ax, ay]
            })
            absRings.push(abs)
        }
    }

    const midX = (minX + maxX) / 2
    const midY = (minY + maxY) / 2
    const span = Math.max(maxX - minX, maxY - minY) || 1
    const target = 0.92
    const spacing = 2.6
    const out: number[] = []
    let seed = 9000

    for (const ring of absRings) {
        const worldPts: Array<[number, number]> = ring.map(([x, y]) => [
            ((x - midX) / span) * target,
            ((y - midY) / span) * target,
        ])
        // Sample in world space by converting back through temporary design-less push
        const path = [...worldPts, worldPts[0]]
        for (let i = 0; i < path.length - 1; i++) {
            const [x0, y0] = path[i]
            const [x1, y1] = path[i + 1]
            const dx = x1 - x0
            const dy = y1 - y0
            const len = Math.hypot(dx, dy)
            if (len < 1e-6) continue
            // spacing is in design px; convert roughly to world units
            const worldSpacing = (spacing / span) * target
            const steps = Math.max(1, Math.ceil(len / worldSpacing))
            for (let s = 0; s < steps; s++) {
                const t = s / steps
                seed++
                const jx = (hash(seed, 1, 5) - 0.5) * worldSpacing * 0.28
                const jy = (hash(seed, 2, 5) - 0.5) * worldSpacing * 0.28
                out.push(
                    x0 + dx * t + jx,
                    y0 + dy * t + jy,
                    (hash(seed, 3, 11) - 0.5) * 0.028
                )
            }
        }
    }

    return subsample(out, count)
}

function buildNebulaField(count: number): { positions: number[]; numSources: number } {
    const out: number[] = []
    let attempts = 0
    const maxAttempts = count * 50
    while (out.length / 3 < count && attempts < maxAttempts) {
        attempts++
        const x = (hash(attempts, 1, 11) - 0.5) * 1.6
        const y = (hash(attempts, 2, 11) - 0.5) * 1.0
        const z = (hash(attempts, 3, 11) - 0.5) * 0.58
        const lobes =
            Math.exp(-(x * x * 5.2 + (y - 0.05) * (y - 0.05) * 8.2 + z * z * 11)) +
            0.7 * Math.exp(-((x - 0.24) * (x - 0.24) * 9.5 + (y + 0.12) * (y + 0.12) * 11 + z * z * 14)) +
            0.58 * Math.exp(-((x + 0.22) * (x + 0.22) * 10 + (y - 0.14) * (y - 0.14) * 9 + z * z * 13)) +
            0.34 * Math.exp(-((x - 0.06) * (x - 0.06) * 20 + (y + 0.24) * (y + 0.24) * 18 + z * z * 22))
        const filament = 0.5 + 0.5 * Math.sin(x * 12.0 + y * 7.5 + hash(attempts, 4, 3) * 6.28318)
        if (hash(attempts, 5, 3) < lobes * filament * 0.7) {
            out.push(x * 0.62, y * 0.55, z * 0.42)
        }
    }
    return { positions: out, numSources: out.length / 3 }
}

function hash(a: number, b: number, salt: number): number {
    const x = Math.sin(a * 127.1 + b * 311.7 + salt * 74.13) * 43758.5453
    return x - Math.floor(x)
}

function gauss(u: number, v: number): number {
    const r = Math.sqrt(-2 * Math.log(Math.max(1e-6, u)))
    return r * Math.cos(2 * Math.PI * v)
}

function loadTexture(
    loader: THREE.TextureLoader,
    url: string,
    onLoad: (t: THREE.Texture) => void
): () => void {
    let texture: THREE.Texture | null = null
    loader.load(url, (loaded) => {
        loaded.wrapS = THREE.RepeatWrapping
        loaded.wrapT = THREE.RepeatWrapping
        loaded.minFilter = THREE.LinearMipmapLinearFilter
        loaded.magFilter = THREE.LinearFilter
        texture = loaded
        onLoad(loaded)
    })
    return () => {
        texture?.dispose()
        texture = null
    }
}

type Vec3Control = { x: number; y: number; z: number }
type SpringSettings = { duration: number; bounce: number }

type Shape = "map" | "dataroom" | "live" | "network" | "investor" | "person" | "wordmark" | "cloud"

type Props = {
    shape: Shape
    points: string
    threshold: number
    scale: number
    cloudSpread: number
    tipLayers: number
    springSettings: SpringSettings
    tipRadius: number
    noiseStrength: number
    noiseScale: number
    cameraFov: number
    cameraPosition: Vec3Control
    cameraRotationX: number
    cameraRotationY: number
    sizeVariance: number
    particleOpacity: number
    simRadius: number
    simStrength: number
    simSpring: number
    simDamping: number
    simMaxVelocity: number
    opacitySpeed: number
    maxDelay: number
    highlightRadius: number
    highlightStrength: number
    highlightSpeed: number
    pulseStrength: number
    pulseSpeedBase: number
    pulseSpeedRandomMax: number
    groupPeriod: number
    groupTight: number
    groupStagger: number
    speedVariance: number
    streakStrength: number
    chromaticStrength: number
    markOpacity: number
    tipTexture?: string
} & FallbackProps

const shell: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
}

function VektaMark({ opacity }: { opacity: number }) {
    return (
        <div
            aria-hidden="true"
            style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                zIndex: 1,
            }}
        >
            <svg
                viewBox="0 0 323.25 350.25"
                width="min(28vmin, 240px)"
                height="min(30.4vmin, 260px)"
                style={{
                    opacity,
                    mixBlendMode: "screen",
                }}
            >
                <path
                    fill="#FFFFFF"
                    d="M321.566 134.5 V24.137 L0.242 238.84 V349.2 Z"
                />
                <path
                    fill="#FFFFFF"
                    d="M219.188 62.848 V0.031 L36.301 122.234 V185.047 Z"
                />
                <path
                    fill="#FFFFFF"
                    d="M321.77 210.68 C246.184 210.68 184.91 271.953 184.91 347.543 H321.77 Z"
                />
            </svg>
        </div>
    )
}

addPropertyControls(Ask, {
    shape: {
        title: "Shape",
        type: ControlType.Enum,
        defaultValue: "map",
        options: ["map", "dataroom", "live", "network", "investor", "person", "wordmark", "cloud"],
        optionTitles: [
            "Folded map",
            "Data room",
            "Live",
            "Network",
            "Investor",
            "Person",
            "Vekta wordmark",
            "Nebula cloud",
        ],
        description: "Outline for the particle field. Custom Points override this.",
    },
    points: {
        title: "Points",
        type: ControlType.String,
        defaultValue: "",
        description: "Comma-separated x,y pairs. Leave empty to use Shape.",
    },
    threshold: {
        title: "Threshold",
        type: ControlType.Number,
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.01,
        description: "Fraction of source points kept when a point list is set.",
    },
    scale: {
        title: "Scale",
        type: ControlType.Number,
        defaultValue: 1,
        min: 0,
        max: 2,
        step: 0.01,
    },
    cloudSpread: {
        title: "Cloud Spread",
        type: ControlType.Number,
        defaultValue: 0.008,
        min: 0,
        max: 0.8,
        step: 0.005,
        description: "How far particles drift from each outline source point.",
    },
    tipLayers: {
        title: "Particles / Point",
        type: ControlType.Number,
        defaultValue: 3,
        min: 1,
        max: 12,
        step: 1,
        description: "Cluster size around each source point.",
    },
    springSettings: {
        title: "Spring Settings",
        type: ControlType.Object,
        controls: {
            duration: {
                title: "Duration",
                type: ControlType.Number,
                defaultValue: 3000,
                min: 0,
                max: 20000,
                step: 10,
            },
            bounce: {
                title: "Bounce",
                type: ControlType.Number,
                defaultValue: 0.2,
                min: 0,
                max: 1,
                step: 0.01,
            },
        },
    },
    tipRadius: {
        title: "Particle Radius",
        type: ControlType.Number,
        defaultValue: 0.0036,
        min: 0.0001,
        max: 0.1,
        step: 0.0001,
    },
    noiseStrength: {
        title: "Noise Strength",
        type: ControlType.Number,
        defaultValue: 0.032,
        min: 0,
        max: 10,
        step: 0.01,
        description: "Slow volumetric drift.",
    },
    noiseScale: {
        title: "Noise Scale",
        type: ControlType.Number,
        defaultValue: 5.0,
        min: 0.1,
        max: 20,
        step: 0.1,
    },
    cameraFov: {
        title: "Camera FOV",
        type: ControlType.Number,
        defaultValue: 36,
        min: 10,
        max: 120,
        step: 1,
    },
    cameraPosition: {
        title: "Camera Position",
        type: ControlType.Object,
        controls: {
            x: { type: ControlType.Number, defaultValue: 0, min: -10, max: 10, step: 0.05 },
            y: { type: ControlType.Number, defaultValue: 0, min: -10, max: 10, step: 0.05 },
            z: { type: ControlType.Number, defaultValue: 1.8, min: -10, max: 10, step: 0.05 },
        },
    },
    cameraRotationX: {
        title: "Camera Rotation X",
        type: ControlType.Number,
        defaultValue: 0,
        min: -180,
        max: 180,
        step: 0.5,
    },
    cameraRotationY: {
        title: "Camera Rotation Y",
        type: ControlType.Number,
        defaultValue: 0,
        min: -180,
        max: 180,
        step: 0.5,
    },
    sizeVariance: {
        title: "Size Variance",
        type: ControlType.Number,
        defaultValue: 0.42,
        min: 0,
        max: 1,
        step: 0.01,
    },
    particleOpacity: {
        title: "Particle Opacity",
        type: ControlType.Number,
        defaultValue: 0.82,
        min: 0,
        max: 1,
        step: 0.01,
    },
    simRadius: {
        title: "Sim Radius",
        type: ControlType.Number,
        defaultValue: 0.28,
        min: 0.01,
        max: 1,
        step: 0.01,
    },
    simStrength: {
        title: "Sim Strength",
        type: ControlType.Number,
        defaultValue: 9,
        min: 0,
        max: 10,
        step: 0.05,
    },
    simSpring: {
        title: "Sim Spring",
        type: ControlType.Number,
        defaultValue: 8,
        min: 0.1,
        max: 100,
        step: 0.1,
        description: "How firmly particles settle back after the cursor parts them.",
    },
    simDamping: {
        title: "Sim Damping",
        type: ControlType.Number,
        defaultValue: 2.6,
        min: 0.1,
        max: 30,
        step: 0.1,
    },
    simMaxVelocity: {
        title: "Sim Max Velocity",
        type: ControlType.Number,
        defaultValue: 3.2,
        min: 0.1,
        max: 20,
        step: 0.1,
    },
    opacitySpeed: {
        title: "Opacity Speed",
        type: ControlType.Number,
        defaultValue: 1.4,
        min: 0.1,
        max: 20,
        step: 0.1,
    },
    maxDelay: {
        title: "Max Delay",
        type: ControlType.Number,
        defaultValue: 0.45,
        min: 0,
        max: 10,
        step: 0.05,
        description: "Staggered fade-in across the field.",
    },
    highlightRadius: {
        title: "Highlight Radius",
        type: ControlType.Number,
        defaultValue: 0.35,
        min: 0.01,
        max: 1,
        step: 0.01,
    },
    highlightStrength: {
        title: "Highlight Strength",
        type: ControlType.Number,
        defaultValue: 1.2,
        min: 0,
        max: 2,
        step: 0.01,
    },
    highlightSpeed: {
        title: "Highlight Speed",
        type: ControlType.Number,
        defaultValue: 8,
        min: 0.1,
        max: 20,
        step: 0.1,
    },
    pulseStrength: {
        title: "Twinkle",
        type: ControlType.Number,
        defaultValue: 0.85,
        min: 0,
        max: 2,
        step: 0.01,
    },
    pulseSpeedBase: {
        title: "Twinkle Speed",
        type: ControlType.Number,
        defaultValue: 0.08,
        min: 0,
        max: 1,
        step: 0.005,
    },
    pulseSpeedRandomMax: {
        title: "Twinkle Random",
        type: ControlType.Number,
        defaultValue: 0.14,
        min: 0,
        max: 1,
        step: 0.005,
    },
    groupPeriod: {
        title: "Group Period",
        type: ControlType.Number,
        defaultValue: 16,
        min: 2,
        max: 30,
        step: 0.1,
        description: "Seconds for one gather → scatter → gather cycle.",
    },
    groupTight: {
        title: "Group Tightness",
        type: ControlType.Number,
        defaultValue: 0.96,
        min: 0.04,
        max: 0.8,
        step: 0.01,
        description: "How small the cluster is when grouped.",
    },
    groupStagger: {
        title: "Group Stagger",
        type: ControlType.Number,
        defaultValue: 0.28,
        min: 0,
        max: 0.8,
        step: 0.01,
        description: "How unevenly particles leave and rejoin the group.",
    },
    speedVariance: {
        title: "Speed Mix",
        type: ControlType.Number,
        defaultValue: 0.7,
        min: 0,
        max: 1,
        step: 0.01,
        description: "Some particles drift slowly, others snap. 0 = uniform.",
    },
    streakStrength: {
        title: "Filament Streak",
        type: ControlType.Number,
        defaultValue: 1.35,
        min: 0,
        max: 6,
        step: 0.05,
        description: "How far particles stretch into hair-like trails.",
    },
    chromaticStrength: {
        title: "Prism Fringe",
        type: ControlType.Number,
        defaultValue: 0.4,
        min: 0,
        max: 2,
        step: 0.01,
        description: "Subtle RGB fringe on the white noise field.",
    },
    markOpacity: {
        title: "Mark Opacity",
        type: ControlType.Number,
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.01,
        description: "Faint Vekta mark in the center of the field.",
    },
    tipTexture: {
        title: "Particle Texture",
        type: ControlType.Image,
        description: "Optional. Soft discs are used when empty.",
    },
    ...fallbackPropertyControls,
})
