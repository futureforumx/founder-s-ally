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
 * Floating particle field — same GPU sim as the strand hero, without tubes.
 * Empty Points builds a volumetric cloud. A point list clusters particles
 * around that silhouette instead.
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 */
export default function ParticleField({
    points = "",
    threshold = 1,
    scale = 1,
    cloudSpread = 0.08,
    tipLayers = 3,
    tipRadius = 0.0068,
    springSettings = { duration: 3000, bounce: 0.2 },
    noiseStrength = 0.18,
    noiseScale = 2.4,
    cameraFov = 36,
    cameraPosition = { x: 0, y: 0, z: 1.8 },
    cameraRotationX = 0,
    cameraRotationY = 0,
    sizeVariance = 0.42,
    particleOpacity = 0.82,
    simRadius = 0.22,
    simStrength = 6,
    simSpring = 8,
    simDamping = 2.6,
    simMaxVelocity = 3.2,
    opacitySpeed = 1.4,
    maxDelay = 0.45,
    highlightRadius = 0.35,
    highlightStrength = 1.2,
    highlightSpeed = 8,
    pulseStrength = 0.85,
    pulseSpeedBase = 0.08,
    pulseSpeedRandomMax = 0.14,
    groupPeriod = 11,
    groupTight = 0.72,
    groupStagger = 0.22,
    speedVariance = 0.7,
    markOpacity = 0.14,
    tipTexture,
    fallbackImage,
    fallbackFit = "cover",
    fallbackAlt = "",
}: Props) {
    const mountRef = useRef<HTMLDivElement>(null)
    const materialRef = useRef<THREE.ShaderMaterial | null>(null)
    const loaderRef = useRef<THREE.TextureLoader>(new THREE.TextureLoader())
    const tipTextureRef = useRef<THREE.Texture | null>(null)

    const { webglAvailable, gpuEpoch, beginSession } = useWebGLGuards("ParticleField")

    const { positions, numSources } = useMemo(
        () => parsePoints(points, threshold),
        [points, threshold]
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

    vec4 centerView = modelViewMatrix * vec4(displacedPos, 1.0);
    float sv = mix(1.0 - uSizeVariance, 1.0, aRandom.y);
    float breath = 0.88 + 0.12 * sin(uTime * 0.35 + aRandom.x * 6.28318);
    float ox = (aUV.x - 0.5) * 2.0 * uTipRadius * sv * breath;
    float oy = (aUV.y - 0.5) * -2.0 * uTipRadius * sv * breath;
    centerView.xy += vec2(ox, oy);
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
uniform float uHasTexture;
uniform sampler2D uTipTexture;

varying vec2  vRandom;
varying vec3  vUV;
varying float vHighlight;
varying float vOpacity;

void main() {
    vec2 centered = vUV.xy - vec2(0.5);
    float r = length(centered) * 2.0;
    if (r > 1.0) discard;

    float core = exp(-r * r * 7.2);
    float halo = exp(-r * r * 1.55) * 0.55;
    float falloff = core + halo;

    float twinkleSpeed = uPulseSpeedBase + vRandom.x * uPulseSpeedRandomMax;
    float twinkle = 0.78 + 0.22 * sin(uTime * twinkleSpeed * 6.28318 + vRandom.y * 11.0);

    vec3 brand = vec3(0.42, 0.44, 1.0);
    vec3 deep = vec3(0.16, 0.22, 0.78);
    vec3 tint = mix(deep, brand, mix(0.5, 1.0, vRandom.y));

    vec3 tex = vec3(1.0);
    if (uHasTexture > 0.5) {
        tex = texture2D(uTipTexture, vUV.xy).xyz;
    }

    float glow = (0.85 + vHighlight * uHighlightStrength * 0.4) * mix(0.85, 1.0, twinkle * uPulseStrength);
    float a = clamp(falloff * vOpacity * uParticleOpacity * mix(0.32, 0.95, vRandom.x) * glow, 0.0, 1.0);
    vec3 color = tint * tex * (0.75 + core * 1.35);
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

function parsePoints(str: string, threshold = 1): { positions: number[] | null; numSources: number } {
    if (!str || !str.trim()) return buildNebulaField(2200)
    const values = str.split(",").map(Number)
    if (values.length < 2 || values.length % 2 !== 0) return buildNebulaField(2200)
    if (values.some(isNaN)) return buildNebulaField(2200)
    const out: number[] = []
    for (let i = 0; i < values.length / 2; i++) {
        if (Math.random() > threshold) continue
        out.push(values[i * 2], values[i * 2 + 1], 0)
    }
    if (out.length === 0) return { positions: null, numSources: 0 }
    return { positions: out, numSources: out.length / 3 }
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

type Props = {
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

addPropertyControls(ParticleField, {
    points: {
        title: "Points",
        type: ControlType.String,
        defaultValue: "",
        description: "Comma-separated x,y pairs. Leave empty for a floating cloud.",
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
        defaultValue: 0.08,
        min: 0,
        max: 0.8,
        step: 0.005,
        description: "How far particles drift from each source point.",
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
        defaultValue: 0.0068,
        min: 0.0001,
        max: 0.1,
        step: 0.0001,
    },
    noiseStrength: {
        title: "Noise Strength",
        type: ControlType.Number,
        defaultValue: 0.18,
        min: 0,
        max: 10,
        step: 0.01,
        description: "Slow volumetric drift.",
    },
    noiseScale: {
        title: "Noise Scale",
        type: ControlType.Number,
        defaultValue: 2.4,
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
        defaultValue: 0.22,
        min: 0.01,
        max: 1,
        step: 0.01,
    },
    simStrength: {
        title: "Sim Strength",
        type: ControlType.Number,
        defaultValue: 6,
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
        defaultValue: 11,
        min: 2,
        max: 30,
        step: 0.1,
        description: "Seconds for one gather → scatter → gather cycle.",
    },
    groupTight: {
        title: "Group Tightness",
        type: ControlType.Number,
        defaultValue: 0.72,
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
    markOpacity: {
        title: "Mark Opacity",
        type: ControlType.Number,
        defaultValue: 0.14,
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
