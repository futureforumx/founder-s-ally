import { motion } from "framer-motion";
import { Check, ArrowRight, Zap, Mail, FileText, Linkedin, CreditCard, Calendar, BarChart3, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import type { OnboardingState } from "./types";

const RECOMMENDED = [
  { id: "gmail", name: "Gmail", icon: Mail, desc: "Maps your intro paths to 500+ VCs" },
  { id: "notion", name: "Notion", icon: FileText, desc: "Syncs your fundraising pipeline" },
  { id: "linkedin", name: "LinkedIn", icon: Linkedin, desc: "Auto-enriches your network graph" },
];

const POWER = [
  { id: "stripe", name: "Stripe", icon: CreditCard, desc: "Live revenue & growth metrics" },
  { id: "granola", name: "Granola", icon: Calendar, desc: "Meeting insights & follow-ups" },
  { id: "hubspot", name: "HubSpot", icon: BarChart3, desc: "CRM deal flow tracking" },
  { id: "attio", name: "Attio", icon: Database, desc: "Relationship intelligence" },
];

interface StepPowerUpProps {
  state: OnboardingState;
  update: (p: Partial<OnboardingState>) => void;
  onNext: () => void;
  onBack: () => void;
}

function IntegrationCard({ id, name, icon: Icon, desc, connected, onConnect }: {
  id: string; name: string; icon: any; desc: string; connected: boolean; onConnect: () => void;
}) {
  return (
    <motion.div
      layout
      className={cn(
        "rounded-xl border p-4 flex items-start gap-3 transition-colors",
        connected ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      )}
    >
      <div className={cn(
        "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
        connected ? "bg-primary/10" : "bg-muted"
      )}>
        {connected ? <Check className="h-4 w-4 text-primary" /> : <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{name}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <Button
        size="sm"
        variant={connected ? "outline" : "default"}
        className="shrink-0 text-xs h-7"
        onClick={onConnect}
        disabled={connected}
      >
        {connected ? "Connected" : "Connect"}
      </Button>
    </motion.div>
  );
}

export function StepPowerUp({ state, update, onNext, onBack }: StepPowerUpProps) {
  const connected = state.connectedIntegrations;
  const meter = Math.round((connected.length / 7) * 100);

  const handleConnect = (id: string) => {
    // Mock connection — in production this would trigger OAuth
    update({ connectedIntegrations: [...connected, id] });
    toast({ title: `${id.charAt(0).toUpperCase() + id.slice(1)} connected!` });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-lg mx-auto space-y-6"
    >
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Power Up</h1>
        <p className="text-sm text-muted-foreground">Connect your tools to unlock intelligent insights.</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-foreground">Intelligence Engine</span>
          </div>
          <span className="text-xs font-semibold text-primary">{meter}%</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Progress value={meter} className="h-2" />
            </div>
          </TooltipTrigger>
          <TooltipContent className="text-xs max-w-[240px]">
            Founders who connect Gmail + Notion get 3× more relevant investor matches in their first week
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Recommended · <span className="text-muted-foreground/50">Most founders connect these first</span>
        </p>
        <div className="space-y-2">
          {RECOMMENDED.map((i) => (
            <IntegrationCard
              key={i.id}
              {...i}
              connected={connected.includes(i.id)}
              onConnect={() => handleConnect(i.id)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Power · <span className="text-muted-foreground/50">For founders actively fundraising</span>
        </p>
        <div className="space-y-2">
          {POWER.map((i) => (
            <IntegrationCard
              key={i.id}
              {...i}
              connected={connected.includes(i.id)}
              onConnect={() => handleConnect(i.id)}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>
        <div className="flex items-center gap-3">
          <button
            onClick={onNext}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors flex items-center gap-1"
          >
            Skip for Now <ArrowRight className="h-3 w-3" />
          </button>
          {connected.length > 0 && <Button size="sm" onClick={onNext}>Continue</Button>}
        </div>
      </div>
    </motion.div>
  );
}
