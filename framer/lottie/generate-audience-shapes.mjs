import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const dir = dirname(fileURLToPath(import.meta.url))
const W = 64
const H = 64
const FR = 60
const OP = 180
const CX = 32
const CY = 32

const GRAY = [0.149, 0.149, 0.149, 1]
const INK = [0.039, 0.039, 0.039, 1]
const LIGHT = [0.961, 0.961, 0.961, 1]
const RED = [1, 0, 0, 1]
const GREEN = [0.008, 1, 0, 1]
const BLUE = [0, 0.039, 1, 1]

const ease = {
    i: { x: [0], y: [1] },
    o: { x: [1], y: [0] },
}

const ease2 = {
    i: { x: [0, 0], y: [1, 1] },
    o: { x: [1, 1], y: [0, 0] },
}

function kf1(t, value, withEase = true) {
    const k = { t, s: [value] }
    if (withEase) Object.assign(k, ease)
    return k
}

function kf2(t, x, y, withEase = true) {
    const k = { t, s: [x, y] }
    if (withEase) Object.assign(k, ease2)
    return k
}

function anim1(keys) {
    return { a: 1, k: keys }
}

function anim2(keys) {
    return { a: 1, k: keys }
}

function static1(v) {
    return { a: 0, k: v }
}

function static2(x, y) {
    return { a: 0, k: [x, y] }
}

function transform(x = 0, y = 0) {
    return {
        ty: "tr",
        p: static2(x, y),
        a: static2(0, 0),
        s: static2(100, 100),
        r: static1(0),
        o: static1(100),
        sk: static1(0),
        sa: static1(0),
    }
}

function layer(name, ind, ip, op, shapes) {
    return {
        ddd: 0,
        ind,
        ty: 4,
        nm: name,
        sr: 1,
        ks: {
            o: static1(100),
            r: static1(0),
            p: static2(CX, CY),
            a: static2(0, 0),
            s: static2(100, 100),
        },
        ao: 0,
        shapes,
        ip,
        op,
        st: 0,
        bm: 0,
    }
}

function stroke(color, width = 1) {
    return {
        ty: "st",
        c: { a: 0, k: color },
        o: static1(100),
        w: static1(width),
        lc: 2,
        lj: 2,
        ml: 4,
    }
}

function fill(color) {
    return {
        ty: "fl",
        c: { a: 0, k: color },
        o: static1(100),
        r: 1,
    }
}

function fadeStroke(color, width, fadeIn, fadeOut) {
    return {
        ty: "st",
        c: { a: 0, k: color },
        o: anim1([kf1(fadeIn, 100), kf1(fadeOut, 0)]),
        w: static1(width),
        lc: 2,
        lj: 2,
        ml: 4,
    }
}

function group(items) {
    return {
        ty: "gr",
        it: [...items, transform()],
    }
}

function pill(color, width, delay, hold = 78) {
    const start = 48 + delay
    const grown = start + 18
    const shrink = start + hold
    const end = shrink + 18
    return group([
        {
            ty: "rc",
            d: 1,
            p: static2(0, 0),
            s: anim2([
                kf2(start, 0, 0),
                kf2(grown, 28, 12),
                kf2(shrink, 28, 12),
                kf2(end, 0, 0),
            ]),
            r: static1(6),
        },
        stroke(color, width),
    ])
}

function ripple(start) {
    const end = start + 58
    return layer(`ripple-${start}`, 0, Math.max(0, start), Math.min(OP, end + 2), [
        group([
            {
                ty: "el",
                p: static2(0, 0),
                s: anim2([kf2(start, 0, 0), kf2(end, 54, 54)]),
            },
            fadeStroke(GRAY, 1, start, end),
        ]),
    ])
}

function bar(color, w, h, x, y, start, grown, shrink, end) {
    const startW = w >= h ? 0 : w
    const startH = h > w ? 0 : h
    return group([
        {
            ty: "rc",
            d: 1,
            p: static2(x, y),
            s: anim2([
                kf2(start, startW, startH),
                kf2(grown, w, h),
                kf2(shrink, w, h),
                kf2(end, startW, startH),
            ]),
            r: static1(0.5),
        },
        fill(color),
    ])
}

function build(name, layers) {
    layers.forEach((l, i) => {
        l.ind = i + 1
    })
    return {
        v: "5.7.8",
        fr: FR,
        ip: 0,
        op: OP,
        w: W,
        h: H,
        nm: name,
        ddd: 0,
        assets: [],
        layers,
    }
}

function institutional() {
    const layers = [
        ripple(-24),
        ripple(6),
        ripple(36),
        ripple(66),
        ripple(96),
        ripple(126),
        ripple(156),
        layer("pill", 0, 48, 156, [
            pill(BLUE, 1, 8),
            pill(GREEN, 1, 5),
            pill(RED, 1, 3),
            pill(INK, 1.5, 0),
            pill(LIGHT, 1, 0),
        ]),
    ]
    return build("Institutional", layers)
}

function pairBars(color, start, extraX = 0) {
    const grown = start + 16
    const shrink = start + 70
    const end = shrink + 16
    return [
        bar(color, 1, 22, -3 - extraX, 0, start, grown, shrink, end),
        bar(color, 1, 22, 3 + extraX, 0, start, grown, shrink, end),
    ]
}

function investors() {
    const layers = [
        layer("ghost-blue", 0, 0, 36, pairBars(BLUE, 0, 1)),
        layer("ghost-green", 0, 0, 34, pairBars(GREEN, 1, 0.5)),
        layer("ghost-red", 0, 0, 32, pairBars(RED, 2, 0)),
        layer("bars", 0, 0, OP, pairBars(GRAY, 3)),
        layer("bars-late", 0, 90, OP, pairBars(GRAY, 96)),
    ]
    return build("Investors", layers)
}

function triple(color, vertical, start, stagger = 2) {
    const items = []
    for (let i = 0; i < 3; i++) {
        const t = start + i * stagger
        const grown = t + 14
        const shrink = t + 72
        const end = shrink + 14
        const offset = (i - 1) * 6
        items.push(
            bar(
                color,
                vertical ? 1 : 24,
                vertical ? 24 : 1,
                vertical ? offset : 0,
                vertical ? 0 : offset,
                t,
                grown,
                shrink,
                end
            )
        )
    }
    return items
}

function founders() {
    return build("Founders", [
        layer("ghost-blue", 0, 0, 34, triple(BLUE, false, 0)),
        layer("ghost-green", 0, 0, 32, triple(GREEN, false, 1)),
        layer("ghost-red", 0, 0, 30, triple(RED, false, 2)),
        layer("lines", 0, 0, OP, triple(GRAY, false, 3)),
        layer("lines-late", 0, 92, OP, triple(GRAY, false, 98)),
    ])
}

function operators() {
    return build("Operators", [
        layer("ghost-blue", 0, 0, 34, triple(BLUE, true, 0)),
        layer("ghost-green", 0, 0, 32, triple(GREEN, true, 1)),
        layer("ghost-red", 0, 0, 30, triple(RED, true, 2)),
        layer("lines", 0, 0, OP, triple(GRAY, true, 3)),
        layer("lines-late", 0, 92, OP, triple(GRAY, true, 98)),
    ])
}

const files = {
    institutional: institutional(),
    investors: investors(),
    founders: founders(),
    operators: operators(),
}

for (const [key, json] of Object.entries(files)) {
    const path = join(dir, `${key}.json`)
    writeFileSync(path, JSON.stringify(json))
    console.log(key, json.layers.length, "layers", (Buffer.byteLength(JSON.stringify(json)) / 1024).toFixed(1), "kb")
}
