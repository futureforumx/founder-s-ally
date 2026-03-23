import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, X, RotateCcw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

export interface WeightConfig {
  fit: number;
  sentiment: number;
  responsiveness: number;
  activity: number;
}

const DEFAULT_WEIGHTS: WeightConfig = { fit: 50, sentiment: 50, responsiveness: 50, activity: 50 };

const LABELS: Record<keyof WeightConfig, { label: string; description: string }> = {
  fit: { label: "Fit", description: "Sector & stage alignment" },
  sentiment: { label: "Sentiment", description: "Community reputation" },
  responsiveness: { label: "Responsiveness", description: "Reply speed & rate" },
  activity: { label: "Activity", description: "Recent deal velocity" },
};

interface Props {
  open: boolean;
  onClose: () => void;
  weights: WeightConfig;
  onChange: (w: WeightConfig) => void;
}

export function PersonalizeWeightsSidebar({ open, onClose, weights, onChange }: Props) {
  const handleReset = () => onChange({ ...DEFAULT_WEIGHTS });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-card border-l border-border shadow-2xl flex flex-col"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-bold text-foreground">Personalize Weights</h3>
              </div>
              <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-secondary transition-colors">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>

            {/* Sliders */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Adjust these weights to re-rank investors based on what matters most to you. Changes apply in real-time.
              </p>

              {(Object.keys(LABELS) as (keyof WeightConfig)[]).map((key) => {
                const { label, description } = LABELS[key];
                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-foreground">{label}</span>
                        <p className="text-[10px] text-muted-foreground">{description}</p>
                      </div>
                      <span className="text-xs font-bold text-accent tabular-nums">{weights[key]}%</span>
                    </div>
                    <Slider
                      value={[weights[key]]}
                      min={0}
                      max={100}
                      step={5}
                      onValueChange={([v]) => onChange({ ...weights, [key]: v })}
                      className="cursor-pointer"
                    />
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-border">
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={handleReset}>
                <RotateCcw className="h-3 w-3" /> Reset to Default
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Re-ranking logic ──

export function applyWeights(
  investors: Array<{ id: string; score: number; [k: string]: any }>,
  weights: WeightConfig,
  firmDimensions: Record<string, { fit: number; sentiment: number; responsiveness: number; activity: number }>,
): Array<{ id: string; score: number; weightedScore: number; [k: string]: any }> {
  const totalWeight = weights.fit + weights.sentiment + weights.responsiveness + weights.activity;
  if (totalWeight === 0) return investors.map(i => ({ ...i, weightedScore: i.score }));

  return investors.map(inv => {
    const dims = firmDimensions[inv.id] || { fit: inv.score, sentiment: inv.score * 0.9, responsiveness: inv.score * 0.85, activity: inv.score * 0.8 };
    const weighted = (
      dims.fit * weights.fit +
      dims.sentiment * weights.sentiment +
      dims.responsiveness * weights.responsiveness +
      dims.activity * weights.activity
    ) / totalWeight;
    return { ...inv, weightedScore: Math.round(weighted) };
  }).sort((a, b) => b.weightedScore - a.weightedScore);
}
