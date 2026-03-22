import { useState, useEffect, useCallback, useRef } from "react";
import confetti from "canvas-confetti";
import { motion, AnimatePresence } from "framer-motion";

const STEPS = [
  { tag: "PDF", label: "Extracting deck layers...", stat: "24 slides parsed" },
  { tag: "WEB", label: "Scraping website...", stat: "47 pages indexed" },
  { tag: "SEARCH", label: "Cross-referencing filings...", stat: "12 sources matched" },
  { tag: "AI", label: "Mapping sectors & landscape...", stat: "8 sectors classified" },
  { tag: "MAP", label: "Building competitive graph...", stat: "6 competitors found" },
];

const STEP_DURATION = 1200; // ms per step

interface AnalysisOverlayProps {
  open: boolean;
  onComplete: () => void;
  companyName?: string;
}

export function AnalysisOverlay({ open, onComplete, companyName }: AnalysisOverlayProps) {
  const [currentStep, setCurrentStep] = useState(-1);
  const [done, setDone] = useState(false);
  const hasFiredConfetti = useRef(false);

  const fireConfetti = useCallback(() => {
    if (hasFiredConfetti.current) return;
    hasFiredConfetti.current = true;

    const colors = ["#39FF14", "#00FF88", "#88FFB8", "#FFFFFF"];
    const end = Date.now() + 600;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0.35, y: 0.5 },
        colors,
        disableForReducedMotion: true,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 0.65, y: 0.5 },
        colors,
        disableForReducedMotion: true,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, []);

  useEffect(() => {
    if (!open) {
      setCurrentStep(-1);
      setDone(false);
      return;
    }

    // Start first step after a short delay
    const startTimer = setTimeout(() => setCurrentStep(0), 300);
    return () => clearTimeout(startTimer);
  }, [open]);

  useEffect(() => {
    if (!open || currentStep < 0) return;
    if (currentStep >= STEPS.length) {
      // All steps done
      const doneTimer = setTimeout(() => {
        setDone(true);
        setTimeout(onComplete, 600);
      }, 400);
      return () => clearTimeout(doneTimer);
    }

    const timer = setTimeout(() => setCurrentStep(prev => prev + 1), STEP_DURATION);
    return () => clearTimeout(timer);
  }, [currentStep, open, onComplete]);

  const progress = currentStep < 0 ? 0 : Math.min((currentStep / STEPS.length) * 100, 100);

  // SVG arc calculations
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (progress / 100) * circumference;

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0, 0, 0, 0.75)" }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-2xl mx-4 rounded-2xl overflow-hidden"
            style={{
              background: "#0e0e0e",
              boxShadow: "0 0 80px rgba(57, 255, 20, 0.08), 0 25px 60px rgba(0, 0, 0, 0.6)",
              border: "1px solid rgba(57, 255, 20, 0.1)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.3)" }}>
                analysis engine
              </span>
              <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.2)" }}>
                {companyName || "STARTUP"}.exec
              </span>
            </div>

            {/* Body */}
            <div className="flex flex-col items-center px-8 py-10 space-y-8">
              {/* Circular progress */}
              <div className="relative">
                <svg width="180" height="180" viewBox="0 0 180 180">
                  {/* Track */}
                  <circle
                    cx="90" cy="90" r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.04)"
                    strokeWidth="3"
                  />
                  {/* Progress arc */}
                  <circle
                    cx="90" cy="90" r={radius}
                    fill="none"
                    stroke="#39FF14"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeOffset}
                    transform="rotate(-90 90 90)"
                    style={{
                      transition: "stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
                      filter: "drop-shadow(0 0 6px rgba(57, 255, 20, 0.4))",
                    }}
                  />
                </svg>

                {/* Center percentage */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span
                    className="font-mono text-3xl font-bold tabular-nums"
                    style={{ color: "#39FF14", textShadow: "0 0 20px rgba(57, 255, 20, 0.3)" }}
                  >
                    {Math.round(progress)}%
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-widest mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
                    {done ? "complete" : "analyzing"}
                  </span>
                </div>
              </div>

              {/* Step log */}
              <div className="w-full space-y-2 min-h-[160px]">
                {STEPS.map((step, i) => {
                  const isCompleted = currentStep > i;
                  const isActive = currentStep === i;
                  const isPending = currentStep < i;

                  return (
                    <motion.div
                      key={step.tag}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{
                        opacity: isPending ? 0.2 : 1,
                        x: 0,
                      }}
                      transition={{ duration: 0.3, delay: i * 0.05 }}
                      className="flex items-center gap-3 px-3 py-1.5 rounded-lg"
                      style={{
                        background: isActive ? "rgba(57, 255, 20, 0.04)" : "transparent",
                      }}
                    >
                      {/* Status indicator */}
                      <div className="w-5 flex justify-center shrink-0">
                        {isCompleted ? (
                          <span style={{ color: "#39FF14" }} className="text-sm">✓</span>
                        ) : isActive ? (
                          <div
                            className="h-2 w-2 rounded-full animate-pulse"
                            style={{ background: "#39FF14", boxShadow: "0 0 8px rgba(57, 255, 20, 0.6)" }}
                          />
                        ) : (
                          <div className="h-1.5 w-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
                        )}
                      </div>

                      {/* Tag */}
                      <span
                        className="font-mono text-[11px] font-bold shrink-0 w-14"
                        style={{
                          color: isCompleted ? "rgba(57, 255, 20, 0.5)"
                            : isActive ? "#39FF14"
                            : "rgba(255,255,255,0.15)",
                        }}
                      >
                        [{step.tag}]
                      </span>

                      {/* Label */}
                      <span
                        className="font-mono text-[11px] flex-1"
                        style={{
                          color: isCompleted ? "rgba(255,255,255,0.35)"
                            : isActive ? "rgba(255,255,255,0.85)"
                            : "rgba(255,255,255,0.15)",
                        }}
                      >
                        {isCompleted ? step.label.replace("...", " ✓") : step.label}
                      </span>

                      {/* Stat chip on complete */}
                      {isCompleted && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="font-mono text-[9px] px-2 py-0.5 rounded-full shrink-0"
                          style={{
                            background: "rgba(57, 255, 20, 0.08)",
                            color: "rgba(57, 255, 20, 0.5)",
                            border: "1px solid rgba(57, 255, 20, 0.1)",
                          }}
                        >
                          {step.stat}
                        </motion.span>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-center gap-2 px-5 py-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-1.5 w-1.5 rounded-full animate-pulse"
                style={{ background: "#39FF14", boxShadow: "0 0 6px rgba(57, 255, 20, 0.5)" }}
              />
              <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                Triple-source triangulation active
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
