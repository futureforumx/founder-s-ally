import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Network, MessageSquare, Sparkles, Building2, Loader2, Star, TrendingUp, Users, MessageCircle, Mail, Clock, ArrowRight, ThumbsUp, Newspaper, MessagesSquare, Share2 } from "lucide-react";
import { IntroPathfinder } from "./IntroPathfinder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectionsGate } from "./ConnectionsGate";
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

const WARM_PATHS = [
  { name: "Alex Rivera", company: "FlowMetrics", badge: "1st Degree", context: "Raised Series A from this firm in Oct 2023.", avatar: "AR" },
  { name: "Priya Sharma", company: "DataLens AI", badge: "2nd Degree", context: "Participated in their Seed round, Jun 2024.", avatar: "PS" },
  { name: "Marcus Chen", company: "BuildStack", badge: "1st Degree", context: "Co-led their Pre-Seed in Mar 2024.", avatar: "MC" },
];

const WHISPER_FEED = [
  {
    header: "Anonymous Founder • Seed Stage SaaS",
    tags: ["Passed after 2nd Meeting", "Helpful Feedback"],
    tagColors: ["bg-secondary text-muted-foreground", "bg-success/10 text-success"],
    text: "They dug really deep into our GTM motion. Ultimately passed because market size was too small for their fund math, but the partner gave us incredibly actionable advice.",
  },
  {
    header: "Anonymous Founder • Series A Fintech",
    tags: ["Term Sheet in 3 Weeks", "Board Seat"],
    tagColors: ["bg-success/10 text-success", "bg-primary/10 text-primary"],
    text: "Fastest process we experienced. Very data-driven diligence, asked for cohort data upfront. Partner was deeply engaged and added real value post-close.",
  },
  {
    header: "Anonymous Founder • Pre-Seed Climate",
    tags: ["Ghosted after IC", "Slow Process"],
    tagColors: ["bg-destructive/10 text-destructive", "bg-warning/10 text-warning"],
    text: "Great initial conversations, felt like strong alignment. After IC presentation there was radio silence for 6 weeks. Eventually got a pass via email with no feedback.",
  },
];

export function ConnectionsTab({ investorName, currentUserId }: ConnectionsTabProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!investorName) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function fetch() {
      setLoading(true);
      const { data, error } = await supabase.rpc("find_connections_by_investor", {
        _investor_name: investorName,
      });

      if (!cancelled) {
        if (!error && data) {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="space-y-5"
    >
      {/* Intro Pathfinder */}
      <IntroPathfinder investorName={investorName} />

      {/* Tier 1: Community Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Card 1: Network Reach */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 flex flex-col min-h-[260px]">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-primary/70 font-semibold">Network Reach</p>
          </div>
          <span className="text-5xl font-black text-foreground leading-none">14</span>
          <p className="text-[10px] text-muted-foreground mt-1 mb-3">Connected founders in the community</p>
          <div className="space-y-1.5 border-t border-primary/10 pt-3">
            <div className="flex items-center gap-2">
              <ThumbsUp className="w-3 h-3 text-success" />
              <span className="text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">8</span> raised from this investor</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-3 h-3 text-accent" />
              <span className="text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">4</span> emailed / engaged</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3 text-warning" />
              <span className="text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">2</span> pending intro opportunities</span>
            </div>
          </div>
          <div className="mt-auto pt-3">
            <button className="text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
              Explore founder connections <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 2: Community Rating */}
        <div className="rounded-2xl border border-success/20 bg-success/5 p-5 flex flex-col min-h-[260px]">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/10">
              <Star className="w-4 h-4 fill-success text-success" />
            </div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-success/70 font-semibold">Community Rating</p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-5xl font-black text-foreground leading-none">4.8</span>
            <span className="text-lg font-semibold text-muted-foreground">/5</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 mb-3">Based on 23 founder reviews</p>
          <div className="space-y-1.5 border-t border-success/10 pt-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-success" />
              <span className="text-[10px] text-muted-foreground">Top trait: <span className="font-semibold text-foreground">Fast Conviction</span></span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-3 h-3 text-success" />
              <span className="text-[10px] text-muted-foreground">Trending <span className="font-semibold text-success">+0.3</span> over 30 days</span>
            </div>
          </div>
        </div>

        {/* Card 3: Social Sentiment */}
        <div className="rounded-2xl border border-success/20 bg-success/5 p-5 flex flex-col min-h-[260px]">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/10">
              <MessageCircle className="w-4 h-4 text-success" />
            </div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-success/70 font-semibold">Social Sentiment</p>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <span className="text-sm font-bold text-success uppercase tracking-wide">Highly Positive</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 mb-3">Across founder chatter, PR, and social signals</p>
          <div className="space-y-1.5 border-t border-success/10 pt-3">
            <div className="flex items-center gap-2">
              <Newspaper className="w-3 h-3 text-success" />
              <span className="text-[10px] text-muted-foreground">PR mentions <span className="font-semibold text-success">trending up</span></span>
            </div>
            <div className="flex items-center gap-2">
              <MessagesSquare className="w-3 h-3 text-success" />
              <span className="text-[10px] text-muted-foreground">Founder chatter <span className="font-semibold text-foreground">active</span></span>
            </div>
            <div className="flex items-center gap-2">
              <Share2 className="w-3 h-3 text-success" />
              <span className="text-[10px] text-muted-foreground">Social signals <span className="font-semibold text-success">positive</span></span>
            </div>
          </div>
          <div className="mt-auto pt-3">
            <button className="text-[10px] font-semibold text-success hover:text-success/80 transition-colors flex items-center gap-1">
              See sentiment drivers <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Tier 2: Warm Connections */}
      <div>
        <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-3">Your Warm Paths</p>
        <div className="space-y-2">
          {WARM_PATHS.map((path) => (
            <div key={path.name} className="flex items-center justify-between p-3.5 bg-card border border-border rounded-xl hover:border-accent/30 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary border border-border text-xs font-bold text-muted-foreground shrink-0">
                  {path.avatar}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{path.name}</span>
                    <span className="text-[10px] text-muted-foreground">{path.company}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                      path.badge === "1st Degree" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                    }`}>
                      {path.badge}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{path.context}</p>
                </div>
              </div>
              <button className="shrink-0 ml-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border hover:bg-secondary px-3.5 py-1.5 rounded-lg transition-colors">
                <MessageSquare className="h-3 w-3" />
                Ask for Intro
              </button>
            </div>
          ))}

          {/* Live DB connections */}
          {connections.map((conn) => (
            <div
              key={conn.user_id}
              className="flex items-center justify-between p-3.5 bg-card border border-border rounded-xl hover:border-accent/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary border border-border shrink-0">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{conn.company_name || "Unnamed Startup"}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-primary/10 text-primary">Cap Table</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {conn.sector && <span className="text-[10px] text-muted-foreground">{conn.sector}</span>}
                    {conn.stage && <><span className="text-muted-foreground/40">·</span><span className="text-[10px] text-muted-foreground">{conn.stage}</span></>}
                  </div>
                </div>
              </div>
              <button className="shrink-0 ml-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border hover:bg-secondary px-3.5 py-1.5 rounded-lg transition-colors">
                <MessageSquare className="h-3 w-3" />
                Ask for Intro
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Tier 3: Structured Feedback */}
      <div>
        <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-3">Founder Experiences</p>

        {/* CTA Box */}
        <div className="bg-foreground text-background rounded-2xl p-5 flex items-center justify-between mb-4 shadow-lg">
          <div className="min-w-0 mr-4">
            <p className="text-sm font-semibold leading-snug">Pitched {investorName} recently?</p>
            <p className="text-xs text-background/60 mt-0.5">Share your experience to help the community.</p>
          </div>
          <button className="shrink-0 bg-background text-foreground font-bold text-xs px-4 py-2 rounded-xl hover:bg-background/90 transition-colors">
            Log Interaction
          </button>
        </div>

        {/* Whisper Feed */}
        <div className="space-y-2">
          {WHISPER_FEED.map((review, i) => (
            <div key={i} className="bg-card border border-border p-4 rounded-xl">
              <p className="text-[10px] text-muted-foreground mb-2">{review.header}</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {review.tags.map((tag, j) => (
                  <span key={tag} className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded ${review.tagColors[j]}`}>
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{review.text}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
