import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Download, Expand, Loader2, Mail, MessageSquare, Minimize, Minus, Plus, Printer, ShieldAlert } from "lucide-react";
import { BouncingDots } from "@/components/loading-ui/bouncing-dots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSupabaseAccessToken } from "@/integrations/supabase/client";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type ShareMetadata = { deckId: string; fileName: string; slideCount: number | null; companyName: string; companyLogoUrl: string | null; companyStage: string | null; showDownload: boolean; contactEmail: string | null };
type GateBrand = { companyName: string; companyLogoUrl: string | null; contactEmail?: string | null };
type SlideExitAction = "next_arrow" | "prev_arrow" | "keyboard" | "top_stepper" | "unload";
type SlideChangeSource = Exclude<SlideExitAction, "unload">;
type ViewerEvent = { eventId: string; type: "session_start" | "slide_view" | "slide_time" | "slide_exit" | "session_end"; slideNumber?: number; activeSeconds?: number; documentId?: string; slideIndex?: number; durationSeconds?: number; exitAction?: SlideExitAction; timestamp?: string };
interface SlideViewEvent {
  documentId: string;
  slideIndex: number;
  durationSeconds: number;
  exitAction: SlideExitAction;
  timestamp: string;
}
interface SlideQuestionPayload {
  deckId: string;
  slideNumber: number;
  totalSlides: number;
  question: string;
  viewerEmail?: string;
  timestamp: string;
}

function emailFromAccessToken(token: string | null): string {
  if (!token) return "";
  try {
    const payload = token.split(".")[1];
    if (!payload) return "";
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { email?: unknown };
    return typeof claims.email === "string" ? claims.email.trim() : "";
  } catch {
    return "";
  }
}

async function submitSlideQuestion(_payload: SlideQuestionPayload): Promise<void> {
  // Replace this mock with the authenticated share-question endpoint when it is available.
  await new Promise((resolve) => window.setTimeout(resolve, 600));
}

function QuestionSuccessToast({ onDismiss }: { onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | null>(null);
  const dismissTimer = useRef<number | null>(null);
  const startTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setVisible(false);
      dismissTimer.current = window.setTimeout(onDismiss, 200);
    }, 3500);
  }, [onDismiss]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true));
    startTimer();
    return () => {
      window.cancelAnimationFrame(frame);
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    };
  }, [startTimer]);

  return <div role="status" aria-live="polite" onMouseEnter={() => { if (timer.current !== null) window.clearTimeout(timer.current); }} onMouseLeave={startTimer} className={`fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-2.5 rounded-full border border-emerald-500/20 bg-neutral-900/95 px-4 py-2.5 text-xs font-medium text-neutral-100 shadow-2xl backdrop-blur-md transition-all duration-200 ease-out sm:right-6 ${visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
    <span className="rounded-full bg-emerald-500/10 p-0.5"><Check aria-hidden="true" className="h-3.5 w-3.5 text-emerald-400" /></span>
    <span>Question sent to founders • We&apos;ll follow up shortly</span>
  </div>;
}

const pdfjsPromise = import("pdfjs-dist/build/pdf.mjs").then((module) => { module.GlobalWorkerOptions.workerSrc = pdfWorkerUrl; return module; });

async function checkSharedPdf(): Promise<void> {
  const response = await fetch("/api/deck-share-file", {
    credentials: "same-origin",
    headers: { Range: "bytes=0-0" },
  });
  await response.body?.cancel().catch(() => {});
  if (!response.ok) {
    const message = response.status === 401
      ? "The viewing session expired. Reload the share link to start a new session."
      : response.status === 404
        ? "The link opened, but its PDF file is missing or inaccessible. Contact the team that shared it."
        : response.status === 410
          ? "This share link has expired or been revoked. Ask the team for a new link."
          : response.status === 415
            ? "This share link does not point to a PDF file. Contact the team that shared it."
            : response.status === 429
              ? "The deck has received too many file requests. Wait a minute, then reload the share link."
              : response.status === 503
                ? "Vekta could not reach the private deck storage. Please contact the team that shared it."
                : `The PDF request failed (HTTP ${response.status}). Reload the share link or contact the team.`;
    throw new Error(message);
  }
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/pdf")) {
    throw new Error("The link returned something other than a PDF. Contact the team that shared it.");
  }
}

async function openShare(shareLookup: { token?: string; companySlug?: string; presentationSlug?: string }, password?: string, viewerEmail?: string) {
  const authToken = await getSupabaseAccessToken();
  const response = await fetch("/api/deck-share-view", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: JSON.stringify({ ...shareLookup, password, viewerEmail }) });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function Viewer({ token, metadata, knownViewerEmail = "" }: { token: string; metadata: ShareMetadata; knownViewerEmail?: string }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<import("pdfjs-dist/types/src/display/api").PDFDocumentProxy | null>(null);
  const queue = useRef<ViewerEvent[]>([]);
  const renderedFirstPage = useRef(false);
  const lastRenderedPage = useRef(0);
  const sessionEndSent = useRef(false);
  const slideStartTime = useRef<number | null>(null);
  const activeSegmentStart = useRef<number | null>(null);
  const activeSlideMilliseconds = useRef(0);
  const pageRef = useRef(1);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [pageCount, setPageCount] = useState(metadata.slideCount || 0);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [questionEmail, setQuestionEmail] = useState(knownViewerEmail.trim());
  const [viewerEmailKnown, setViewerEmailKnown] = useState(Boolean(knownViewerEmail.trim()));
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionError, setQuestionError] = useState("");
  const [questionToast, setQuestionToast] = useState(false);
  const [idle, setIdle] = useState(false);
  const [navigationIdle, setNavigationIdle] = useState(false);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setQuestionEmail(knownViewerEmail.trim());
    setViewerEmailKnown(Boolean(knownViewerEmail.trim()));
  }, [knownViewerEmail]);

  useEffect(() => {
    let active = true;
    void getSupabaseAccessToken().then((accessToken) => {
      if (!active) return;
      const email = emailFromAccessToken(accessToken);
      if (email) {
        setQuestionEmail((current) => current || email);
        setViewerEmailKnown(true);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let timer = 0;
    let navigationTimer = 0;
    const markActivity = () => {
      setIdle(false);
      setNavigationIdle(false);
      window.clearTimeout(timer);
      window.clearTimeout(navigationTimer);
      timer = window.setTimeout(() => setIdle(true), 3000);
      navigationTimer = window.setTimeout(() => setNavigationIdle(true), 2500);
    };
    markActivity();
    window.addEventListener("pointermove", markActivity, { passive: true });
    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    window.addEventListener("touchstart", markActivity, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(navigationTimer);
      window.removeEventListener("pointermove", markActivity);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("touchstart", markActivity);
    };
  }, []);

  const enqueue = useCallback((event: Omit<ViewerEvent, "eventId">) => {
    queue.current.push({ ...event, eventId: crypto.randomUUID() });
  }, []);
  const flush = useCallback(async (keepalive = false) => {
    if (!queue.current.length) return;
    const batch = queue.current.slice(0, 20);
    try {
      const response = await fetch("/api/deck-share-events", { method: "POST", credentials: "same-origin", keepalive, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: batch }) });
      if (response.ok) {
        const ids = new Set(batch.map((event) => event.eventId));
        queue.current = queue.current.filter((event) => !ids.has(event.eventId));
      }
    } catch { /* Keep event IDs queued; the next batch retries idempotently. */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let task: { promise: Promise<import("pdfjs-dist/types/src/display/api").PDFDocumentProxy>; destroy: () => Promise<void> } | undefined;
    (async () => {
      try {
        await checkSharedPdf();
        if (cancelled) return;
        const pdfjs = await pdfjsPromise;
        task = pdfjs.getDocument({ url: "/api/deck-share-file", withCredentials: true, disableAutoFetch: true, disableStream: true, rangeChunkSize: 256 * 1024 });
        const document = await task.promise;
        if (cancelled) { await document.destroy(); return; }
        pdfRef.current = document;
        setPageCount(document.numPages);
        setLoading(false);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error && loadError.message
            ? loadError.message
            : "The PDF could not be read. Check the file and try again.");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; if (task) void task.destroy(); };
  }, [token]);

  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const size = entries[0]?.contentRect;
      setStageSize({ width: size?.width ?? node.clientWidth, height: size?.height ?? node.clientHeight });
    });
    observer.observe(node);
    setStageSize({ width: node.clientWidth, height: node.clientHeight });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pdfRef.current || !canvas.current || !stageSize.width || !stageSize.height || loading) return;
      try {
        const pdfPage = await pdfRef.current.getPage(page);
        const base = pdfPage.getViewport({ scale: 1 });
        const fitScale = Math.max(0.1, Math.min((stageSize.width - 32) / base.width, (stageSize.height - 32) / base.height, 2));
        const scale = fitScale * zoom;
        const viewport = pdfPage.getViewport({ scale });
        const ratio = Math.max(1, window.devicePixelRatio || 1);
        const target = canvas.current;
        target.width = Math.floor(viewport.width * ratio);
        target.height = Math.floor(viewport.height * ratio);
        target.style.width = `${Math.floor(viewport.width)}px`;
        target.style.height = `${Math.floor(viewport.height)}px`;
        const context = target.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas unavailable");
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        const renderTask = pdfPage.render({ canvasContext: context, viewport });
        await renderTask.promise;
        if (cancelled) return;
        setPageInput(String(page));
        if (!renderedFirstPage.current) {
          renderedFirstPage.current = true;
          enqueue({ type: "session_start", slideNumber: page });
        }
        if (lastRenderedPage.current !== page) {
          lastRenderedPage.current = page;
          pageRef.current = page;
          if (slideStartTime.current === null) slideStartTime.current = Date.now();
          if (document.visibilityState === "visible" && activeSegmentStart.current === null) activeSegmentStart.current = Date.now();
          enqueue({ type: "slide_view", slideNumber: page });
        }
        void flush();
      } catch { if (!cancelled) setError("This PDF slide could not be rendered."); }
    })();
    return () => { cancelled = true; };
  }, [page, stageSize.width, stageSize.height, zoom, loading, enqueue, flush]);

  const commitActiveTime = useCallback(() => {
    const now = Date.now();
    const segmentStart = activeSegmentStart.current;
    if (segmentStart === null || !renderedFirstPage.current) return;
    const elapsed = Math.max(0, now - segmentStart);
    activeSlideMilliseconds.current += elapsed;
    activeSegmentStart.current = now;
    let wholeSeconds = Math.floor(elapsed / 1000);
    while (wholeSeconds > 0) {
      const activeSeconds = Math.min(wholeSeconds, 20);
      enqueue({ type: "slide_time", slideNumber: pageRef.current, activeSeconds });
      wholeSeconds -= activeSeconds;
    }
  }, [enqueue]);

  const sendBeaconBatch = useCallback(() => {
    if (!queue.current.length) return;
    if (!navigator.sendBeacon) { void flush(true); return; }
    while (queue.current.length) {
      const batch = queue.current.slice(0, 20);
      const accepted = navigator.sendBeacon("/api/deck-share-events", new Blob([JSON.stringify({ events: batch })], { type: "application/json" }));
      if (!accepted) { void flush(true); return; }
      const ids = new Set(batch.map((event) => event.eventId));
      queue.current = queue.current.filter((event) => !ids.has(event.eventId));
    }
  }, [flush]);

  const closeSlideSession = useCallback(() => {
    const activeSlide = pageRef.current;
    if (slideStartTime.current !== null && lastRenderedPage.current === activeSlide) {
      commitActiveTime();
      const payload: SlideViewEvent = {
        documentId: metadata.deckId,
        slideIndex: activeSlide,
        durationSeconds: Number((activeSlideMilliseconds.current / 1000).toFixed(3)),
        exitAction: "unload",
        timestamp: new Date().toISOString(),
      };
      enqueue({ type: "slide_exit", ...payload });
    }
    slideStartTime.current = null;
    activeSegmentStart.current = null;
    activeSlideMilliseconds.current = 0;
  }, [commitActiveTime, enqueue, metadata.deckId]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        closeSlideSession();
        sendBeaconBatch();
        return;
      }
      if (lastRenderedPage.current === pageRef.current) {
        slideStartTime.current = Date.now();
        activeSlideMilliseconds.current = 0;
        activeSegmentStart.current = Date.now();
      }
    };
    const onHide = () => {
      if (sessionEndSent.current) return;
      sessionEndSent.current = true;
      closeSlideSession();
      enqueue({ type: "session_end", slideNumber: pageRef.current });
      sendBeaconBatch();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    const timer = window.setInterval(() => {
      commitActiveTime();
      void flush();
    }, 15_000);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, [closeSlideSession, commitActiveTime, enqueue, flush, sendBeaconBatch]);

  const changeSlide = useCallback((newIndex: number, triggerSource: SlideChangeSource) => {
    const destination = Math.max(1, Math.min(pageCount, Math.trunc(newIndex)));
    const currentSlide = pageRef.current;
    if (!Number.isFinite(destination) || destination === currentSlide || pageCount < 1) return;

    if (slideStartTime.current !== null && lastRenderedPage.current === currentSlide) {
      commitActiveTime();
      const payload: SlideViewEvent = {
        documentId: metadata.deckId,
        slideIndex: currentSlide,
        durationSeconds: Number((activeSlideMilliseconds.current / 1000).toFixed(3)),
        exitAction: triggerSource,
        timestamp: new Date().toISOString(),
      };
      enqueue({ type: "slide_exit", ...payload });
      void flush();
    }

    slideStartTime.current = Date.now();
    activeSegmentStart.current = null;
    activeSlideMilliseconds.current = 0;
    pageRef.current = destination;
    setPageInput(String(destination));
    setPage(destination);
  }, [commitActiveTime, enqueue, flush, metadata.deckId, pageCount]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const isTextEntry = target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest("input, textarea, select, button, a, [contenteditable='true']")));
      if (!isTextEntry && !event.altKey && !event.ctrlKey && !event.metaKey && (event.key.toLowerCase() === "c" || event.key.toLowerCase() === "q")) {
        event.preventDefault();
        setQuestionOpen(true);
        return;
      }
      if (!metadata.showDownload && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        return;
      }
      if (!isTextEntry && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (["ArrowRight", "ArrowDown", " ", "Enter"].includes(event.key)) {
          event.preventDefault();
          changeSlide(pageRef.current + 1, "keyboard");
        } else if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          changeSlide(pageRef.current - 1, "keyboard");
        }
      }
      if (event.key === "Escape" && !questionOpen && document.fullscreenElement) void document.exitFullscreen();
    };
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFullscreen); };
  }, [changeSlide, metadata.showDownload, questionOpen]);

  const handleSubmitQuestion = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    const trimmedEmail = questionEmail.trim();
    if (!trimmedQuestion || (!viewerEmailKnown && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail))) return;
    setQuestionLoading(true);
    setQuestionError("");
    const payload: SlideQuestionPayload = {
      deckId: metadata.deckId,
      slideNumber: page,
      totalSlides: pageCount,
      question: trimmedQuestion,
      ...(trimmedEmail ? { viewerEmail: trimmedEmail } : {}),
      timestamp: new Date().toISOString(),
    };
    try {
      await submitSlideQuestion(payload);
      setQuestion("");
      setQuestionEmail((current) => viewerEmailKnown ? current : "");
      setQuestionError("");
      setQuestionOpen(false);
      setQuestionToast(true);
    } catch {
      setQuestionError("Your question couldn’t be sent. Please try again.");
    } finally {
      setQuestionLoading(false);
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapper.current?.requestFullscreen?.();
  };
  const jumpToPage = () => {
    const destination = Number.parseInt(pageInput, 10);
    if (Number.isInteger(destination) && destination >= 1 && destination <= pageCount) changeSlide(destination, "top_stepper");
    else setPageInput(String(page));
  };
  const printDeck = () => {
    if (!metadata.showDownload) return;
    const frame = document.createElement("iframe");
    frame.title = "Print shared pitch deck";
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.border = "0";
    frame.src = "/api/deck-share-file";
    frame.onload = () => {
      window.setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(() => frame.remove(), 60_000);
      }, 300);
    };
    document.body.appendChild(frame);
  };
  const downloadDeck = () => {
    if (!metadata.showDownload) return;
    const link = document.createElement("a");
    link.href = "/api/deck-share-file";
    link.download = metadata.fileName;
    link.rel = "noreferrer";
    link.click();
  };

  return <div ref={wrapper} className="relative flex h-[calc(100dvh-5rem)] min-h-[28rem] flex-col overflow-hidden border-y border-border bg-[#111318] data-[fullscreen=true]:h-screen data-[fullscreen=true]:min-h-screen data-[fullscreen=true]:border-0" data-fullscreen={fullscreen}>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/10 px-3 py-2 text-white sm:min-h-14 sm:px-5" data-deck-share-toolbar>
      <div className="flex min-w-0 flex-1 items-center gap-2.5 text-xs sm:flex-none">
        {metadata.companyLogoUrl ? <img src={metadata.companyLogoUrl} alt={`${metadata.companyName} logo`} className="h-7 w-7 shrink-0 rounded-md object-contain" /> : <img src="/brand/vekta-mark-white.svg" alt="" className="h-6 w-6 shrink-0 object-contain" />}
        <span className="max-w-[35vw] truncate font-medium">{metadata.companyName}</span>
        <span className="shrink-0 text-white/65">{metadata.companyStage || "Fundraising round not set"}</span>
      </div>
      <div className="flex w-full flex-wrap items-center justify-between gap-1 sm:w-auto sm:justify-end">
        <div role="group" aria-label="Slide navigation" className="flex h-8 items-center gap-1 rounded-md border border-white/15 px-1 text-xs text-white/80" title="Jump to slide">
          <Button size="icon" variant="ghost" onClick={() => changeSlide(pageRef.current - 1, "top_stepper")} disabled={page <= 1} className="h-6 w-6 text-white/75 hover:bg-white/10 hover:text-white disabled:opacity-25" aria-label="Previous slide"><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <label className="flex items-center gap-1"><span className="sr-only">Jump to slide</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={pageInput} onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ""))} onBlur={jumpToPage} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); jumpToPage(); event.currentTarget.blur(); } }} aria-label="Jump to slide" className="w-8 bg-transparent text-right tabular-nums text-white outline-none" /><span className="tabular-nums">/ {pageCount || "…"}</span></label>
          <Button size="icon" variant="ghost" onClick={() => changeSlide(pageRef.current + 1, "top_stepper")} disabled={page >= pageCount} className="h-6 w-6 text-white/75 hover:bg-white/10 hover:text-white disabled:opacity-25" aria-label="Next slide"><ChevronRight className="h-3.5 w-3.5" /></Button>
        </div>
        <Button size="icon" variant="ghost" onClick={toggleFullscreen} className="h-8 w-8 text-white hover:bg-white/10 hover:text-white" aria-label={fullscreen ? "Exit fullscreen" : "View fullscreen"} title={fullscreen ? "Exit fullscreen" : "Fullscreen"}>{fullscreen ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}</Button>
        <Button size="icon" variant="ghost" onClick={() => { commitActiveTime(); setZoom((current) => Math.max(0.5, Math.round((current - 0.25) * 100) / 100)); }} disabled={zoom <= 0.5} className="h-8 w-8 text-white hover:bg-white/10 hover:text-white" aria-label="Zoom out" title="Zoom out"><Minus className="h-4 w-4" /></Button>
        <span className="min-w-10 text-center text-[10px] tabular-nums text-white/70" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <Button size="icon" variant="ghost" onClick={() => { commitActiveTime(); setZoom((current) => Math.min(3, Math.round((current + 0.25) * 100) / 100)); }} disabled={zoom >= 3} className="h-8 w-8 text-white hover:bg-white/10 hover:text-white" aria-label="Zoom in" title="Zoom in"><Plus className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={downloadDeck} disabled={!metadata.showDownload} className="h-8 w-8 text-white hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:text-white/35 disabled:hover:bg-transparent" aria-label="Download deck" title={metadata.showDownload ? "Download" : "Download disabled by the owner"}><Download className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={printDeck} disabled={!metadata.showDownload} className="h-8 w-8 text-white hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:text-white/35 disabled:hover:bg-transparent" aria-label="Print deck" title={metadata.showDownload ? "Print" : "Print disabled by the owner"}><Printer className="h-4 w-4" /></Button>
      </div>
    </div>
    <div ref={stage} className="flex min-h-0 flex-1 overflow-auto p-3 sm:p-5">
      <div className="m-auto flex shrink-0 items-center justify-center">
      {loading && <div className="flex items-center gap-2 text-xs text-white/70"><Loader2 className="h-4 w-4 animate-spin" />Preparing your PDF…</div>}
      {error && <div className="flex max-w-sm flex-col items-center gap-2 text-center text-white/80"><ShieldAlert className="h-6 w-6 text-amber-300" /><p className="text-sm">Deck unavailable</p><p className="text-xs text-white/50">{error}</p></div>}
      {!loading && !error && <canvas ref={canvas} className="block max-w-none shrink-0 rounded-sm bg-white shadow-2xl" aria-label={`Slide ${page}`} data-deck-share-canvas />}
      </div>
    </div>
    {!loading && !error && <>
      <button type="button" onClick={() => changeSlide(pageRef.current - 1, "prev_arrow")} disabled={page <= 1} aria-label="Previous slide" title="Previous slide" className={`absolute left-3 top-1/2 z-30 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-neutral-900/60 text-white/90 shadow-xl backdrop-blur transition-all duration-300 hover:bg-neutral-800/90 hover:border-white/20 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none disabled:opacity-20 sm:left-5 sm:h-12 sm:w-12 ${navigationIdle ? "opacity-30 hover:opacity-100 focus-visible:opacity-100" : "opacity-90"}`}>
        <ChevronLeft aria-hidden="true" className="h-6 w-6" />
      </button>
      <button type="button" onClick={() => changeSlide(pageRef.current + 1, "next_arrow")} disabled={page >= pageCount} aria-label="Next slide" title="Next slide" className={`absolute right-3 top-1/2 z-30 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-neutral-900/60 text-white/90 shadow-xl backdrop-blur transition-all duration-300 hover:bg-neutral-800/90 hover:border-white/20 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none disabled:opacity-20 sm:right-5 sm:h-12 sm:w-12 ${navigationIdle ? "opacity-30 hover:opacity-100 focus-visible:opacity-100" : "opacity-90"}`}>
        <ChevronRight aria-hidden="true" className="h-6 w-6" />
      </button>
    </>}
    <button type="button" onClick={() => setQuestionOpen(true)} aria-haspopup="dialog" aria-expanded={questionOpen} className={`fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-3 z-40 inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-neutral-900/80 px-4 py-2.5 text-sm font-medium text-neutral-200 shadow-2xl backdrop-blur-md transition-all duration-200 hover:border-white/20 hover:bg-neutral-800/90 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:right-6 ${fullscreen || idle ? "opacity-40 hover:opacity-100 focus-visible:opacity-100" : "opacity-100"}`}>
      <MessageSquare aria-hidden="true" className="h-4 w-4 text-neutral-400" />
      <span>Ask about slide {page}</span>
    </button>
    <Dialog open={questionOpen} onOpenChange={(open) => { setQuestionOpen(open); if (!open) setQuestionError(""); }}>
      <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); questionInput.current?.focus(); }} onEscapeKeyDown={() => setQuestionOpen(false)} className="fixed inset-x-3 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] top-auto left-auto w-auto max-w-none translate-x-0 translate-y-0 gap-5 rounded-2xl border-white/10 bg-neutral-900 p-5 text-neutral-100 shadow-2xl duration-200 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2 sm:inset-auto sm:bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:right-6 sm:w-[min(28rem,calc(100vw-3rem))] sm:max-w-[28rem] sm:rounded-2xl">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="text-base text-white">Ask about slide {page}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-neutral-400">Send a direct question to the founding team regarding this slide.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void handleSubmitQuestion(event)} className="space-y-3">
          <label className="sr-only" htmlFor="deck-slide-question">Your question</label>
          <textarea ref={questionInput} id="deck-slide-question" rows={3} maxLength={4000} required value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What would you like to know?" className="w-full resize-y rounded-lg border border-white/10 bg-neutral-950 p-3 text-sm text-white placeholder:text-neutral-500 focus:border-white/30 focus:outline-none focus:ring-0" />
          {!viewerEmailKnown && <div>
            <label htmlFor="deck-slide-question-email" className="mb-1.5 block text-xs font-medium text-neutral-300">Email</label>
            <Input id="deck-slide-question-email" type="email" autoComplete="email" required value={questionEmail} onChange={(event) => setQuestionEmail(event.target.value)} placeholder="you@company.com" className="h-10 border-white/10 bg-neutral-950 text-sm text-white placeholder:text-neutral-500 focus-visible:border-white/30 focus-visible:ring-0" />
          </div>}
          {questionError && <p role="alert" className="text-xs text-rose-300">{questionError}</p>}
          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={questionLoading || !question.trim() || (!viewerEmailKnown && !questionEmail.trim())} className="h-9 rounded-full bg-white px-4 text-xs font-semibold text-neutral-900 hover:bg-neutral-200 disabled:opacity-50">
              {questionLoading && <Loader2 aria-hidden="true" className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {questionLoading ? "Sending…" : "Send Question"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    {questionToast && <QuestionSuccessToast onDismiss={() => setQuestionToast(false)} />}
  </div>;
}

export default function DeckSharePage() {
  const { token = "", companySlug = "", presentationSlug = "" } = useParams<{ token: string; companySlug: string; presentationSlug: string }>();
  const shareLookup = useMemo(() => ({ ...(companySlug && presentationSlug ? { companySlug, presentationSlug } : { token }) }), [companySlug, presentationSlug, token]);
  const shareRouteKey = companySlug && presentationSlug ? `${companySlug}/${presentationSlug}` : token;
  const [metadata, setMetadata] = useState<ShareMetadata | null>(null);
  const [gateBrand, setGateBrand] = useState<GateBrand>({ companyName: "Vekta founder", companyLogoUrl: null });
  const [loading, setLoading] = useState(true);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [requiresEmail, setRequiresEmail] = useState(false);
  const [password, setPassword] = useState("");
  const [viewerEmail, setViewerEmail] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (candidate?: { password: string; email: string }) => {
    setLoading(true); setError("");
    try {
      const { response, data } = await openShare(shareLookup, candidate?.password, candidate?.email);
      if ((response.status === 401 || response.status === 403) && (data.requiresPassword || data.requiresEmail)) {
        setRequiresPassword(Boolean(data.requiresPassword));
        setRequiresEmail(Boolean(data.requiresEmail));
        setGateBrand({ companyName: data.companyName || "Vekta founder", companyLogoUrl: data.companyLogoUrl || null, contactEmail: data.contactEmail || null });
        setError(candidate?.password || candidate?.email ? data.error || "Check the required details and try again." : "");
        return;
      }
      if (!response.ok || !data.ok) { setError(data.error || "This sharing link is unavailable."); return; }
      setRequiresPassword(false);
      setRequiresEmail(false);
      setMetadata({ deckId: data.deckId, fileName: data.fileName, slideCount: data.slideCount, companyName: data.companyName, companyLogoUrl: data.companyLogoUrl, companyStage: data.companyStage, showDownload: data.showDownload, contactEmail: data.contactEmail || null });
    } catch { setError("Something went wrong opening this deck."); }
    finally { setLoading(false); }
  }, [shareLookup]);
  useEffect(() => { void load(); }, [load]);

  const accessGateVisible = !loading && (requiresPassword || requiresEmail) && !metadata;

  return <div className={`min-h-screen font-sans antialiased ${accessGateVisible ? "bg-black text-neutral-100" : "bg-background text-foreground"}`}>
    {!accessGateVisible && <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-7">
      <a href="https://tryvekta.com" target="_blank" rel="noopener noreferrer" aria-label="Visit Vekta" className="flex min-w-0 items-center gap-2.5">
        <img src="/brand/vekta-mark-white.svg" alt="Vekta" className="h-7 w-7 shrink-0 object-contain sm:h-8 sm:w-8" />
        <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:text-[10px]">Secure viewing</span>
      </a>
      <a href={`mailto:${metadata?.contactEmail || gateBrand.contactEmail || "support@vekta.app"}`} className="inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground sm:text-sm" aria-label="Contact the company team">
        <Mail className="h-4 w-4" />
        <span>Contact team</span>
      </a>
    </header>}
    {loading && <div className="flex min-h-[65vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><BouncingDots />Checking sharing access…</div>}
    {accessGateVisible && <>
      <a href="https://tryvekta.com" target="_blank" rel="noopener noreferrer" aria-label="Visit Vekta" className="absolute left-5 top-4 z-10 sm:left-8 sm:top-6">
        <img src="/brand/vekta-mark-white-transparent.png" alt="Vekta" className="h-8 w-8 object-contain sm:h-9 sm:w-9" />
      </a>
      <main className="mx-auto flex min-h-screen w-full items-center justify-center px-4 py-20 sm:px-6">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950 p-6 text-neutral-100 shadow-2xl sm:p-8">
        <div className="mb-5 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black p-2">
            <img src={gateBrand.companyLogoUrl || "/brand/vekta-mark-white.svg"} alt={`${gateBrand.companyName} logo`} className="h-full w-full object-contain" />
          </div>
        </div>
        <div>
          <h1 className="mx-auto max-w-sm text-center text-lg font-semibold leading-tight tracking-tight sm:text-xl">Complete the required steps to view this content</h1>
          <form className="mt-6 flex w-full flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void load({ password, email: viewerEmail }); }}>
            {requiresEmail && <div className="space-y-2">
              <label htmlFor="deck-viewer-email" className="block text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-300">EMAIL</label>
              <Input id="deck-viewer-email" type="email" autoComplete="email" aria-label="Your email address" value={viewerEmail} onChange={(event) => setViewerEmail(event.target.value)} required className="h-11 rounded-lg border-white/10 bg-neutral-900 px-3 text-sm text-white placeholder:text-neutral-500 focus-visible:ring-[#A487F5]" />
              <p id="deck-viewer-email-privacy" className="text-xs leading-relaxed text-neutral-500">This information will be shared with {gateBrand.companyName}. Learn more about how we use and protect your data in our <a href="https://www.tryvekta.com/privacypolicy/filesharing" target="_blank" rel="noopener noreferrer" className="text-[#A487F5] underline underline-offset-2 hover:text-[#b79fff]">Privacy Policy</a>.</p>
            </div>}
            {requiresPassword && <div className="space-y-2">
              <label htmlFor="deck-viewer-password" className="block text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-300">PASSWORD</label>
              <Input id="deck-viewer-password" type="password" autoComplete="current-password" aria-label="Deck password" value={password} onChange={(event) => setPassword(event.target.value)} required className="h-11 rounded-lg border-white/10 bg-neutral-900 px-3 text-sm text-white placeholder:text-neutral-500 focus-visible:ring-[#A487F5]" />
            </div>}
            {error && <p role="alert" className="-mt-1 text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={(requiresPassword && !password) || (requiresEmail && !viewerEmail)} className="mt-1 h-11 w-full rounded-lg bg-[#A487F5] px-5 text-sm font-semibold text-black hover:bg-[#b79fff] disabled:bg-[#A487F5]/50 disabled:text-black/60">Continue</Button>
          </form>
        </div>
      </section>
      </main>
    </>}
    {!loading && error && !requiresPassword && !metadata && <main className="flex min-h-[65vh] flex-col items-center justify-center gap-3 px-5 text-center"><ShieldAlert className="h-7 w-7 text-muted-foreground" /><h1 className="text-base font-semibold">Link unavailable</h1><p className="max-w-sm text-xs text-muted-foreground">{error}</p></main>}
    {!loading && metadata && <main className="w-full px-0 py-0"><Viewer key={shareRouteKey} token={shareRouteKey} metadata={metadata} knownViewerEmail={viewerEmail} /><p className="px-4 py-2 text-left text-xs text-muted-foreground"><a href="https://www.tryvekta.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">Vekta Privacy Policy</a></p></main>}
  </div>;
}
