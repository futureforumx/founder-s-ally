import { motion, AnimatePresence } from "framer-motion";
import {
  X, ArrowLeft, Building2, Linkedin, ExternalLink, Sparkles,
  Users, BookOpen, ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { PartnerPerson, FirmAffiliation } from "./investor-detail/types";
import { getFirmForPerson } from "./investor-detail/types";

interface PersonProfileModalProps {
  person: PartnerPerson | null;
  onClose: () => void;
  onNavigateToFirm: (firmId: string) => void;
}

export function PersonProfileModal({ person, onClose, onNavigateToFirm }: PersonProfileModalProps) {
  const firm: FirmAffiliation | null = person ? getFirmForPerson(person.id) : null;

  return (
    <AnimatePresence>
      {person && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm supports-[backdrop-filter]:bg-foreground/15"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="pointer-events-auto max-w-3xl w-full bg-card rounded-3xl shadow-2xl border border-border/50 overflow-hidden relative max-h-[85vh] flex flex-col"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
            >
              {/* ── Back button + Close ── */}
              <div className="px-8 pt-5 pb-0 flex items-center justify-between shrink-0">
                {firm && (
                  <button
                    onClick={() => onNavigateToFirm(firm.id)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to {firm.firm_name}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary/60 transition-colors ml-auto"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* ── Header: Avatar + Name + Firm Badge ── */}
              <div className="px-8 pt-5 pb-6 border-b border-border shrink-0">
                <div className="flex items-center gap-5">
                  <Avatar className="h-20 w-20 border-2 border-border shadow-sm">
                    <AvatarFallback className="text-2xl font-bold bg-secondary text-muted-foreground">
                      {person.name.split(" ").map(n => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h2 className="text-2xl font-bold text-foreground">{person.name}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{person.title}</p>

                    {/* Firm Backlink Badge */}
                    {firm && (
                      <button
                        onClick={() => onNavigateToFirm(firm.id)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 mt-2.5 bg-secondary/50 border border-border rounded-lg hover:bg-accent/10 hover:border-accent/30 cursor-pointer transition-colors"
                      >
                        <div className="flex h-5 w-5 items-center justify-center rounded bg-muted border border-border">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <span className="text-xs font-medium text-foreground">
                          Partner at <span className="text-accent">{firm.firm_name}</span>
                        </span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}

                    {/* Focus Badges */}
                    <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                      {person.focus.map(f => (
                        <Badge key={f} variant="secondary" className="text-[10px] px-2 py-0.5">{f}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Body Content ── */}
              <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
                {/* Personal Investment Thesis */}
                {person.personalThesis && (
                  <div>
                    <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">
                      <Sparkles className="h-3 w-3 inline mr-1 text-accent" /> Personal Investment Thesis
                    </h4>
                    <div className="rounded-xl bg-accent/5 border border-accent/10 p-4">
                      <p className="text-sm text-foreground leading-relaxed">{person.personalThesis}</p>
                    </div>
                  </div>
                )}

                {/* Board Seats */}
                {person.boardSeats && person.boardSeats.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">
                      <Users className="h-3 w-3 inline mr-1" /> Board Seats
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {person.boardSeats.map(seat => (
                        <div
                          key={seat}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card hover:border-accent/20 transition-colors"
                        >
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary border border-border text-[10px] font-bold text-muted-foreground">
                            {seat.charAt(0)}
                          </div>
                          <span className="text-sm font-medium text-foreground">{seat}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* LinkedIn */}
                {person.linkedIn && (
                  <div>
                    <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">
                      Social
                    </h4>
                    <a
                      href={person.linkedIn}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card hover:border-accent/30 hover:shadow-sm transition-all text-sm font-medium text-foreground"
                    >
                      <Linkedin className="h-4 w-4 text-[#0A66C2]" />
                      LinkedIn Profile
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                  </div>
                )}

                {/* Recent Articles */}
                {person.recentArticles && person.recentArticles.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">
                      <BookOpen className="h-3 w-3 inline mr-1" /> Recent Articles & Thought Leadership
                    </h4>
                    <div className="space-y-2">
                      {person.recentArticles.map((article, i) => (
                        <a
                          key={i}
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between rounded-xl border border-border bg-card p-3.5 hover:border-accent/20 hover:shadow-sm transition-all group"
                        >
                          <div>
                            <span className="text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                              {article.title}
                            </span>
                            <span className="block text-[10px] text-muted-foreground mt-0.5">{article.date}</span>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
