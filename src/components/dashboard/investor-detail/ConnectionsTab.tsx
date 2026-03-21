import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Network, MessageSquare, Sparkles, Building2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface Connection {
  user_id: string;
  company_name: string;
  sector: string | null;
  stage: string | null;
  investor_amount: number;
  instrument: string;
}

interface ConnectionsTabProps {
  investorName: string;
  currentUserId?: string;
}

export function ConnectionsTab({ investorName, currentUserId }: ConnectionsTabProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!investorName) return;
    let cancelled = false;

    async function fetch() {
      setLoading(true);
      const { data, error } = await supabase.rpc("find_connections_by_investor", {
        _investor_name: investorName,
      });

      if (!cancelled) {
        if (!error && data) {
          // Filter out current user from the list — they already know they're connected
          setConnections(
            (data as Connection[]).filter((c) => c.user_id !== currentUserId)
          );
        }
        setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [investorName, currentUserId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Scanning network…</span>
      </div>
    );
  }

  // Empty state
  if (connections.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/60 border border-border/40 mb-5">
          <Network className="h-7 w-7 text-muted-foreground/60" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1.5">
          No active connections yet
        </h3>
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
          None of the founders in your immediate network have added this investor to their cap table. Be the first to connect!
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <Network className="h-3 w-3 inline mr-1 text-accent" />
          In-Network Founders backed by {investorName}
        </h4>
        <Badge variant="secondary" className="text-[10px]">
          {connections.length} connection{connections.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {connections.map((conn) => {
          const isMutual = false; // Future: check mutual graph
          return (
            <div
              key={conn.user_id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:border-accent/30 transition-colors"
            >
              {/* Left: Identity */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary border border-border">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {conn.company_name || "Unnamed Startup"}
                    </span>
                    {isMutual && (
                      <Badge className="text-[8px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-500/20 shrink-0">
                        <Sparkles className="h-2 w-2 mr-0.5" /> Mutual
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {conn.sector && (
                      <span className="text-xs text-muted-foreground truncate">{conn.sector}</span>
                    )}
                    {conn.stage && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-xs text-muted-foreground">{conn.stage}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Action */}
              <button className="shrink-0 ml-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-lg transition-colors">
                <MessageSquare className="h-3 w-3" />
                Ask for Intro
              </button>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
