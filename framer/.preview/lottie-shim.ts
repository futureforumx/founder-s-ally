type AnimationItem = {
    play: () => void
    pause: () => void
    destroy: () => void
    setDirection: (d: number) => void
    setSpeed: (s: number) => void
    goToAndPlay: (v: number, isFrame?: boolean) => void
    goToAndStop: (v: number, isFrame?: boolean) => void
    getDuration: (inFrames?: boolean) => number
}

type Options = {
    container: Element
    renderer?: string
    loop?: boolean
    autoplay?: boolean
    animationData?: unknown
    rendererSettings?: Record<string, string>
}

function loadFromCdn(): Promise<any> {
    const w = window as any
    if (w.lottie) return Promise.resolve(w.lottie)
    if (w.__lottieLoading) return w.__lottieLoading
    w.__lottieLoading = new Promise((resolve, reject) => {
        const script = document.createElement("script")
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js"
        script.onload = () => resolve(w.lottie)
        script.onerror = reject
        document.head.appendChild(script)
    })
    return w.__lottieLoading
}

const pending: Array<() => void> = []

const lottie = {
    loadAnimation(options: Options): AnimationItem {
        let anim: any = null
        const stub: AnimationItem = {
            play: () => anim?.play(),
            pause: () => anim?.pause(),
            destroy: () => anim?.destroy(),
            setDirection: (d) => anim?.setDirection(d),
            setSpeed: (s) => anim?.setSpeed(s),
            goToAndPlay: (v, isFrame) => anim?.goToAndPlay(v, isFrame),
            goToAndStop: (v, isFrame) => anim?.goToAndStop(v, isFrame),
            getDuration: (inFrames) => anim?.getDuration(inFrames) ?? 0,
        }
        loadFromCdn().then((api) => {
            anim = api.loadAnimation(options)
            pending.splice(0).forEach((fn) => fn())
        })
        return stub
    },
    setQuality() {},
}

export default lottie
