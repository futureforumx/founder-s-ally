import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, MessageSquare, CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ReviewSubmissionModalProps {
  open: boolean;
  onClose: () => void;
  firmName: string;
  firmId?: string;
}

const INTERACTION_TYPES = [
  { key: "meeting", label: "Meeting", emoji: "📅" },
  { key: "email", label: "Email", emoji: "✉️" },
  { key: "intro", label: "Intro", emoji: "🤝" },
] as const;

export function ReviewSubmissionModal({ open, onClose, firmName }: ReviewSubmissionModalProps) {
  const [step, setStep] = useState(1);
  const [nps, setNps] = useState<number | null>(null);
  const [interactionType, setInteractionType] = useState<string | null>(null);
  const [responded, setResponded] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep(1);
    setNps(null);
    setInteractionType(null);
    setResponded(null);
    setComment("");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    // Simulate submission
    await new Promise(r => setTimeout(r, 800));
    toast.success("Review submitted anonymously. Thank you!");
    setSubmitting(false);
    reset();
    onClose();
  };

  const canAdvance = () => {
    if (step === 1) return nps !== null;
    if (step === 2) return interactionType !== null;
    if (step === 3) return responded !== null;
    return true;
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-foreground/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="pointer-events-auto w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-warning" />
                  <h3 className="text-sm font-bold text-foreground">Rate your Interaction</h3>
                </div>
                <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-secondary transition-colors">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* Progress */}
              <div className="px-6 pt-4">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4].map(s => (
                    <div
                      key={s}
                      className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                        s <= step ? "bg-accent" : "bg-secondary"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 font-medium">
                  Step {step} of 4 · {firmName}
                </p>
              </div>

              {/* Content */}
              <div className="px-6 py-5 min-h-[180px]">
                <AnimatePresence mode="wait">
                  {step === 1 && (
                    <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                      <p className="text-sm font-medium text-foreground">How likely are you to recommend {firmName} to another founder?</p>
                      <div className="flex gap-1">
                        {Array.from({ length: 11 }, (_, i) => (
                          <button
                            key={i}
                            onClick={() => setNps(i)}
                            className={`flex-1 h-10 rounded-lg text-xs font-bold transition-all duration-150 ${
                              nps === i
                                ? i >= 9 ? "bg-success text-success-foreground scale-110"
                                  : i >= 7 ? "bg-warning text-warning-foreground scale-110"
                                    : "bg-destructive text-destructive-foreground scale-110"
                                : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                            }`}
                          >
                            {i}
                          </button>
                        ))}
                      </div>
                      <div className="flex justify-between text-[9px] text-muted-foreground">
                        <span>Not likely</span>
                        <span>Extremely likely</span>
                      </div>
                    </motion.div>
                  )}

                  {step === 2 && (
                    <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                      <p className="text-sm font-medium text-foreground">What happened?</p>
                      <div className="flex gap-3">
                        {INTERACTION_TYPES.map(t => (
                          <button
                            key={t.key}
                            onClick={() => setInteractionType(t.key)}
                            className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-150 ${
                              interactionType === t.key
                                ? "border-accent bg-accent/5"
                                : "border-border hover:border-accent/30"
                            }`}
                          >
                            <span className="text-2xl">{t.emoji}</span>
                            <span className="text-xs font-semibold text-foreground">{t.label}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {step === 3 && (
                    <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                      <p className="text-sm font-medium text-foreground">Did they respond?</p>
                      <div className="flex gap-3">
                        {[
                          { val: true, label: "Yes", icon: CheckCircle2, cls: "border-success bg-success/5" },
                          { val: false, label: "No", icon: X, cls: "border-destructive bg-destructive/5" },
                        ].map(opt => (
                          <button
                            key={String(opt.val)}
                            onClick={() => setResponded(opt.val)}
                            className={`flex-1 flex items-center justify-center gap-2 p-5 rounded-xl border-2 transition-all duration-150 ${
                              responded === opt.val ? opt.cls : "border-border hover:border-accent/30"
                            }`}
                          >
                            <opt.icon className="h-5 w-5" />
                            <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {step === 4 && (
                    <motion.div key="s4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                      <p className="text-sm font-medium text-foreground">Any additional comments? <span className="text-muted-foreground font-normal">(anonymous)</span></p>
                      <Textarea
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder="Share your experience to help other founders..."
                        rows={4}
                        maxLength={500}
                        className="resize-none text-sm"
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">{comment.length}/500</span>
                        <Badge variant="outline" className="text-[9px]">
                          <MessageSquare className="h-2.5 w-2.5 mr-1" /> Anonymous
                        </Badge>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-secondary/20">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => step > 1 ? setStep(step - 1) : onClose()}
                  className="text-muted-foreground"
                >
                  {step > 1 ? "Back" : "Cancel"}
                </Button>
                {step < 4 ? (
                  <Button
                    size="sm"
                    onClick={() => setStep(step + 1)}
                    disabled={!canAdvance()}
                    className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    <Send className="h-3 w-3" />
                    {submitting ? "Submitting..." : "Submit Review"}
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
