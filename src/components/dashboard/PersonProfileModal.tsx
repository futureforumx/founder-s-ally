import { motion, AnimatePresence } from "framer-motion";
import {
  X, ArrowLeft, Building2, Linkedin, ExternalLink, Sparkles,
  Users, BookOpen, ChevronRight, Mail,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { VCPerson, VCFirm } from "@/hooks/useVCDirectory";

interface PersonProfileModalProps {
  person: VCPerson | null;
  firm: VCFirm | null;
  onClose: () => void;
  onNavigateToFirm: (firmId: string) => void;
}

export function PersonProfileModal({ person, firm, onClose, onNavigateToFirm }: PersonProfileModalProps) {
  return (
    <AnimatePresence>
      {person && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm supports-[backdrop-filter]:bg-foreground/15"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="pointer-events-auto max-w-3xl w-full bg-card rounded-3xl shadow-2xl border border-border/50 overflow-hidden relative max-h-[85vh] flex flex-col"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
            >
              {/* Back + Close */}
              <div className="px-8 pt-5 pb-0 flex items-center justify-between shrink-0">
                {firm && (
                  <button
                    onClick={() => onNavigateToFirm(firm.id)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to {firm.name}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary/60 transition-colors ml-auto"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Header */}
              <div className="px-8 pt-5 pb-6 border-b border-border shrink-0">
                <div className="flex items-center gap-5">
                  <Avatar className="h-20 w-20 border-2 border-border shadow-sm">
                    <AvatarFallback className="text-2xl font-bold bg-secondary text-muted-foreground">
                      {person.full_name.split(" ").map(n => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h2 className="text-2xl font-bold text-foreground">{person.full_name}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{person.title || "Investor"}</p>

                    {firm && (
                      <button
                        onClick={() => onNavigateToFirm(firm.id)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 mt-2.5 bg-secondary/50 border border-border rounded-lg hover:bg-accent/10 hover:border-accent/30 cursor-pointer transition-colors"
                      >
                        <div className="flex h-5 w-5 items-center justify-center rounded bg-muted border border-border">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <span className="text-xs font-medium text-foreground">
                          {person.title || "Partner"} at <span className="text-accent">{firm.name}</span>
                        </span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}

                    {firm?.sectors && firm.sectors.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                        {firm.sectors.slice(0, 4).map(s => (
                          <Badge key={s} variant="secondary" className="text-[10px] px-2 py-0.5">{s}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
                {person.email && (
                  <div>
                    <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">
                      Contact
                    </h4>
                    <a
                      href={`mailto:${person.email}`}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card hover:border-accent/30 hover:shadow-sm transition-all text-sm font-medium text-foreground"
                    >
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {person.email}
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                  </div>
                )}

                {firm && (
                  <div>
                    <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">
                      <Building2 className="h-3 w-3 inline mr-1" /> Firm Details
                    </h4>
                    <div className="rounded-xl bg-secondary/30 border border-border p-4 space-y-3">
                      {firm.description && (
                        <p className="text-sm text-foreground leading-relaxed">{firm.description}</p>
                      )}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {firm.aum && (
                          <div>
                            <span className="text-muted-foreground text-xs">AUM</span>
                            <p className="font-medium text-foreground">{firm.aum}</p>
                          </div>
                        )}
                        {firm.sweet_spot && (
                          <div>
                            <span className="text-muted-foreground text-xs">Sweet Spot</span>
                            <p className="font-medium text-foreground">{firm.sweet_spot}</p>
                          </div>
                        )}
                      </div>
                      {firm.stages && firm.stages.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {firm.stages.map(st => (
                            <Badge key={st} variant="outline" className="text-[10px]">{st}</Badge>
                          ))}
                        </div>
                      )}
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
