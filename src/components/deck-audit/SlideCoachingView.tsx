import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Lightbulb, MessageSquareWarning, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { SlideAnalysis } from "./types";

interface SlideCoachingViewProps {
  slides: SlideAnalysis[];
  deckUrl?: string | null;
}

export function SlideCoachingView({ slides, deckUrl }: SlideCoachingViewProps) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [slideImages, setSlideImages] = useState<Record<number, string>>({});
  const [renderingSlides, setRenderingSlides] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderedRef = useRef(false);

  // Render PDF pages to images
  const renderPdfSlides = useCallback(async (url: string) => {
    if (renderedRef.current) return;
    renderedRef.current = true;
    setRenderingSlides(true);

    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const images: Record<number, string> = {};
      const maxPages = Math.min(pdf.numPages, slides.length);

      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;
        images[i] = canvas.toDataURL("image/jpeg", 0.85);
      }

      setSlideImages(images);
    } catch (err) {
      console.error("Failed to render PDF slides:", err);
    } finally {
      setRenderingSlides(false);
    }
  }, [slides.length]);

  useEffect(() => {
    if (deckUrl) {
      renderedRef.current = false;
      renderPdfSlides(deckUrl);
    }
  }, [deckUrl, renderPdfSlides]);

  if (slides.length === 0) return null;

  const slide = slides[activeSlide];
  const slideImage = slideImages[slide.slide_number];

  const getRiskColor = (risk: number) =>
    risk >= 30 ? "text-destructive bg-destructive/10" :
    risk >= 15 ? "text-warning bg-warning/10" :
    "text-success bg-success/10";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Slide Carousel */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Slide Preview</h3>
        <div className="relative rounded-xl border border-border bg-card overflow-hidden">
          <div className="aspect-[16/9] bg-muted/30 flex items-center justify-center relative overflow-hidden">
            {slideImage ? (
              <img
                src={slideImage}
                alt={`Slide ${slide.slide_number}`}
                className="w-full h-full object-contain"
              />
            ) : renderingSlides ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-[10px] font-medium">Rendering slides…</span>
              </div>
            ) : (
              <div className="text-center">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Slide {slide.slide_number}</span>
                <p className="text-lg font-bold text-foreground mt-1">{slide.detected_intent}</p>
              </div>
            )}
            <div className={cn("absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-bold tabular-nums", getRiskColor(slide.predicted_dropoff_risk))}>
              {slide.predicted_dropoff_risk}% drop-off
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
            <button
              onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))}
              disabled={activeSlide === 0}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex gap-1">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveSlide(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === activeSlide ? "w-5 bg-accent" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  )}
                />
              ))}
            </div>
            <button
              onClick={() => setActiveSlide(Math.min(slides.length - 1, activeSlide + 1))}
              disabled={activeSlide === slides.length - 1}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Slide thumbnails */}
        <div className="flex gap-1.5 w-full pb-1">
          {slides.map((s, i) => {
            const thumbImg = slideImages[s.slide_number];
            return (
              <button
                key={i}
                onClick={() => setActiveSlide(i)}
                className={cn(
                  "flex-1 min-w-0 rounded-md border overflow-hidden transition-all",
                  thumbImg ? "h-14" : "h-9",
                  i === activeSlide
                    ? "border-accent bg-accent/5 ring-1 ring-accent/30"
                    : "border-border bg-card hover:border-accent/40"
                )}
              >
                {thumbImg ? (
                  <img src={thumbImg} alt={`Slide ${s.slide_number}`} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[9px] font-medium text-muted-foreground flex items-center justify-center h-full">
                    {s.slide_number}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Insights */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">
          Insights — <span className="text-accent">Slide {slide.slide_number}: {slide.detected_intent}</span>
        </h3>

        {slide.feedback.concrete_edits.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs font-semibold text-foreground">Concrete Edits</span>
            </div>
            <ul className="space-y-2">
              {slide.feedback.concrete_edits.map((e, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}

        {slide.feedback.missing_elements.length > 0 && (
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              <span className="text-xs font-semibold text-foreground">Missing Elements</span>
            </div>
            <ul className="space-y-2">
              {slide.feedback.missing_elements.map((m, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}

        {slide.feedback.investor_objections.length > 0 && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <MessageSquareWarning className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs font-semibold text-foreground">Likely Investor Objections</span>
            </div>
            <ul className="space-y-2">
              {slide.feedback.investor_objections.map((o, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground italic">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-destructive" />
                  "{o}"
                </li>
              ))}
            </ul>
          </div>
        )}

        {slide.feedback.concrete_edits.length === 0 && slide.feedback.missing_elements.length === 0 && slide.feedback.investor_objections.length === 0 && (
          <div className="rounded-xl border border-success/20 bg-success/5 p-6 text-center">
            <p className="text-xs font-semibold text-success">This slide looks solid — no major issues detected.</p>
          </div>
        )}
      </div>
    </div>
  );
}