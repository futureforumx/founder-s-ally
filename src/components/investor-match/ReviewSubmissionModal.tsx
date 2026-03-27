import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, MessageSquare, CheckCircle2, Send, Loader2, ThumbsUp, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ReviewSubmissionModalProps {
  open: boolean;
  onClose: () => void;
  firmName: string;
  firmId?: string;
}

const INTERACTION_TYPES = [
  { key: "meeting", label: "Meeting", emoji: "📅", desc: "Took a pitch or intro call" },
  { key: "email", label: "Email", emoji: "✉️", desc: "Sent a cold or warm email" },
  { key: "intro", label: "Intro", emoji: "🤝", desc: "Got a warm introduction" },
] as const;

const NPS_LABELS: Record<number, string> = {
  0: "Terrible", 1: "Awful", 2: "Bad", 3: "Poor", 4: "Below Average",
  5: "Neutral", 6: "Okay", 7: "Good", 8: "Great", 9: "Excellent", 10: "Outstanding",
};

function useExistingReview(firmId?: string) {
  const { user } = useAuth();
  const [existing, setExisting] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firmId || !user?.id) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("investor_reviews" as any)
        .select("*")
        .eq("founder_id", user.id)
        .eq("firm_id", firmId)
        .maybeSingle();
      setExisting(data);
      setLoading(false);
    })();
  }, [firmId, user?.id]);

  return { existing, loading };
}

export function ReviewSubmissionModal({ open, onClose, firmName, firmId }: ReviewSubmissionModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [nps, setNps] = useState<number | null>(null);
  const [interactionType, setInteractionType] = useState<string | null>(null);
  const [responded, setResponded] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { existing, loading: loadingExisting } = useExistingReview(firmId);

  // Pre-fill if existing review
  useEffect(() => {
    if (existing && open) {
      setNps(existing.nps_score);
      setInteractionType(existing.interaction_type);
      setResponded(existing.did_respond);
      setComment(existing.comment || "");
    }
  }, [existing, open]);

  const reset = () => {
    setStep(1);
    setNps(null);
    setInteractionType(null);
    setResponded(null);
    setComment("");
    setSubmitted(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (nps === null || !interactionType || responded === null) return;
    setSubmitting(true);

    try {
      if (!user?.id) throw new Error("Not authenticated");

      // Resolve firm_id if not provided
      let resolvedFirmId = firmId;
      if (!resolvedFirmId) {
        const { data: firms } = await supabase
          .from("investor_database")
          .select("id")
          .ilike("firm_name", firmName.trim())
          .limit(1);
        resolvedFirmId = firms?.[0]?.id;
      }
      if (!resolvedFirmId) throw new Error("Could not resolve firm");

      const payload = {
        founder_id: user.id,
        firm_id: resolvedFirmId,
        nps_score: nps,
        interaction_type: interactionType,
        did_respond: responded,
        comment: comment.trim() || null,
      };

      // Upsert (unique on founder_id + firm_id)
      const { error } = await supabase
        .from("investor_reviews" as any)
        .upsert(payload, { onConflict: "founder_id,firm_id" });

      if (error) throw error;

      setSubmitted(true);
      toast.success("Review submitted anonymously. Thank you!");

      // Auto-close after success animation
      setTimeout(() => {
        handleClose();
      }, 1800);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  const canAdvance = () => {
    if (step === 1) return nps !== null;
    if (step === 2) return interactionType !== null;
    if (step === 3) return responded !== null;
    return true;
  };

  const npsColor = (i: number) => {
    if (nps !== i) return "bg-secondary text-muted-foreground hover:bg-secondary/80";
    if (i >= 9) return "bg-success text-success-foreground ring-2 ring-success/30 scale-110";
    if (i >= 7) return "bg-accent text-accent-foreground ring-2 ring-accent/30 scale-110";
    if (i >= 5) return "bg-warning text-warning-foreground ring-2 ring-warning/30 scale-110";
    return "bg-destructive text-destructive-foreground ring-2 ring-destructive/30 scale-110";
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
            onClick={handleClose}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="pointer-events-auto w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/20">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning/10">
                    <Star className="h-4 w-4 text-warning" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Rate your Interaction</h3>
                    <p className="text-[11px] text-muted-foreground">{firmName} · {existing ? "Update Review" : "New Review"}</p>
                  </div>
                </div>
                <button onClick={handleClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Success State */}
              {submitted ? (
                <motion.div
                  className="flex flex-col items-center justify-center py-16 px-6"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <motion.div
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 mb-4"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.1 }}
                  >
                    <CheckCircle2 className="h-8 w-8 text-success" />
                  </motion.div>
                  <h3 className="text-lg font-bold text-foreground mb-1">Thank You!</h3>
                  <p className="text-sm text-muted-foreground text-center">Your anonymous review helps fellow founders make better decisions.</p>
                </motion.div>
              ) : loadingExisting ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Progress */}
                  <div className="px-6 pt-4">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4].map(s => (
                        <div key={s} className="flex-1 h-1.5 rounded-full relative overflow-hidden bg-secondary">
                          {s <= step && (
                            <motion.div
                              className="absolute inset-0 bg-accent rounded-full"
                              initial={{ scaleX: 0 }}
                              animate={{ scaleX: 1 }}
                              transition={{ duration: 0.3, ease: "easeOut" }}
                              style={{ transformOrigin: "left" }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[10px] text-muted-foreground font-medium">
                        Step {step} of 4
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {step === 1 && "How would you rate them?"}
                        {step === 2 && "What type of interaction?"}
                        {step === 3 && "Did they follow up?"}
                        {step === 4 && "Share your experience"}
                      </p>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="px-6 py-6 min-h-[220px]">
                    <AnimatePresence mode="wait">
                      {/* Step 1: NPS */}
                      {step === 1 && (
                        <motion.div key="s1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }} className="space-y-5">
                          <div>
                            <p className="text-sm font-semibold text-foreground mb-1">How likely are you to recommend {firmName}?</p>
                            <p className="text-xs text-muted-foreground">0 = Would never recommend · 10 = Highly recommend</p>
                          </div>
                          <div className="grid grid-cols-11 gap-1.5">
                            {Array.from({ length: 11 }, (_, i) => (
                              <button
                                key={i}
                                onClick={() => setNps(i)}
                                className={`h-11 rounded-lg text-xs font-bold transition-all duration-150 ${npsColor(i)}`}
                              >
                                {i}
                              </button>
                            ))}
                          </div>
                          {nps !== null && (
                            <motion.div
                              className="flex items-center gap-2"
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                            >
                              <div className={`h-2 w-2 rounded-full ${nps >= 9 ? "bg-success" : nps >= 7 ? "bg-accent" : nps >= 5 ? "bg-warning" : "bg-destructive"}`} />
                              <span className="text-xs font-semibold text-foreground">{NPS_LABELS[nps]}</span>
                              <span className="text-[10px] text-muted-foreground ml-1">
                                ({nps >= 9 ? "Promoter" : nps >= 7 ? "Passive" : "Detractor"})
                              </span>
                            </motion.div>
                          )}
                        </motion.div>
                      )}

                      {/* Step 2: Interaction Type */}
                      {step === 2 && (
                        <motion.div key="s2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }} className="space-y-5">
                          <div>
                            <p className="text-sm font-semibold text-foreground mb-1">What happened?</p>
                            <p className="text-xs text-muted-foreground">Select the type of interaction you had with {firmName}.</p>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            {INTERACTION_TYPES.map(t => (
                              <button
                                key={t.key}
                                onClick={() => setInteractionType(t.key)}
                                className={`flex flex-col items-center gap-2.5 p-5 rounded-xl border-2 transition-all duration-200 ${
                                  interactionType === t.key
                                    ? "border-accent bg-accent/5 shadow-sm"
                                    : "border-border hover:border-accent/30 hover:bg-secondary/30"
                                }`}
                              >
                                <span className="text-3xl">{t.emoji}</span>
                                <span className="text-xs font-bold text-foreground">{t.label}</span>
                                <span className="text-[10px] text-muted-foreground text-center leading-tight">{t.desc}</span>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {/* Step 3: Did they respond? */}
                      {step === 3 && (
                        <motion.div key="s3" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }} className="space-y-5">
                          <div>
                            <p className="text-sm font-semibold text-foreground mb-1">Did they respond?</p>
                            <p className="text-xs text-muted-foreground">This helps calculate the Responsiveness score for {firmName}.</p>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            {[
                              { val: true, label: "Yes, they responded", icon: CheckCircle2, desc: "Got a reply or follow-up", borderCls: "border-success", bgCls: "bg-success/5" },
                              { val: false, label: "No response", icon: AlertCircle, desc: "Radio silence or ghosted", borderCls: "border-destructive", bgCls: "bg-destructive/5" },
                            ].map(opt => (
                              <button
                                key={String(opt.val)}
                                onClick={() => setResponded(opt.val)}
                                className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all duration-200 ${
                                  responded === opt.val
                                    ? `${opt.borderCls} ${opt.bgCls} shadow-sm`
                                    : "border-border hover:border-accent/30"
                                }`}
                              >
                                <opt.icon className={`h-8 w-8 ${responded === opt.val ? (opt.val ? "text-success" : "text-destructive") : "text-muted-foreground"}`} />
                                <span className="text-sm font-bold text-foreground">{opt.label}</span>
                                <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                              </button>
                            ))}
                          </div>
                          {responded !== null && (
                            <motion.div
                              className={`flex items-center gap-2 px-4 py-3 rounded-lg ${responded ? "bg-success/5 border border-success/20" : "bg-destructive/5 border border-destructive/20"}`}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                            >
                              <ThumbsUp className={`h-3.5 w-3.5 ${responded ? "text-success" : "text-destructive"}`} />
                              <span className="text-[11px] text-foreground">
                                {responded
                                  ? "Great — this contributes positively to their responsiveness score."
                                  : "Noted — this will factor into their responsiveness metric."}
                              </span>
                            </motion.div>
                          )}
                        </motion.div>
                      )}

                      {/* Step 4: Comment */}
                      {step === 4 && (
                        <motion.div key="s4" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }} className="space-y-4">
                          <div>
                            <p className="text-sm font-semibold text-foreground mb-1">Any additional comments?</p>
                            <p className="text-xs text-muted-foreground">Optional — your feedback is completely anonymous.</p>
                          </div>
                          <Textarea
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            placeholder="e.g., 'Partner was very knowledgeable about our space, gave helpful feedback even though they passed...'"
                            rows={5}
                            maxLength={500}
                            className="resize-none text-sm"
                          />
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground tabular-nums">{comment.length}/500 characters</span>
                            <Badge variant="outline" className="text-[9px] gap-1">
                              <MessageSquare className="h-2.5 w-2.5" /> Anonymous & Encrypted
                            </Badge>
                          </div>

                          {/* Review Summary */}
                          <div className="rounded-xl bg-secondary/40 border border-border/50 p-4 space-y-2.5">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Review Summary</span>
                            <div className="grid grid-cols-3 gap-3">
                              <div className="text-center">
                                <span className={`text-lg font-black ${nps !== null && nps >= 7 ? "text-success" : nps !== null && nps >= 5 ? "text-warning" : "text-destructive"}`}>
                                  {nps ?? "—"}
                                </span>
                                <p className="text-[9px] text-muted-foreground">NPS Score</p>
                              </div>
                              <div className="text-center">
                                <span className="text-lg">
                                  {interactionType === "meeting" ? "📅" : interactionType === "email" ? "✉️" : "🤝"}
                                </span>
                                <p className="text-[9px] text-muted-foreground capitalize">{interactionType}</p>
                              </div>
                              <div className="text-center">
                                <span className={`text-lg font-black ${responded ? "text-success" : "text-destructive"}`}>
                                  {responded ? "✓" : "✗"}
                                </span>
                                <p className="text-[9px] text-muted-foreground">{responded ? "Responded" : "No Reply"}</p>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-secondary/10">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => step > 1 ? setStep(step - 1) : handleClose()}
                      className="text-muted-foreground"
                    >
                      {step > 1 ? "← Back" : "Cancel"}
                    </Button>
                    {step < 4 ? (
                      <Button
                        size="sm"
                        onClick={() => setStep(step + 1)}
                        disabled={!canAdvance()}
                        className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90 px-6"
                      >
                        Next →
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90 px-6"
                      >
                        {submitting ? (
                          <><Loader2 className="h-3 w-3 animate-spin" /> Submitting...</>
                        ) : (
                          <><Send className="h-3 w-3" /> Submit Review</>
                        )}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
