import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Database,
  Loader2,
  Mail,
  Sheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveContext } from "@/context/ActiveContext";
import { useAuth } from "@/hooks/useAuth";
import { useConnectedAccounts } from "@/hooks/useConnectedAccounts";
import { toast } from "@/hooks/use-toast";
import {
  startGoogleCalendarOAuthRedirect,
  startGoogleOAuthRedirect,
  startGoogleSheetsOAuthRedirect,
} from "@/lib/connectorClient";
import { isOwnerContextUuid } from "@/lib/connectorContextStorage";
import { cn } from "@/lib/utils";
import type { OnboardingState } from "./types";

type LiveConnector = "gmail" | "google_calendar" | "google_sheets";

interface StepConnectionsProps {
  state: OnboardingState;
  update: (partial: Partial<OnboardingState>) => void;
  onBack: () => void;
  onNext: (connectedIntegrations: string[]) => void;
  meta?: { eyebrow?: string; title?: string; subtitle?: string };
}

const liveConnectors: Array<{
  key: LiveConnector;
  name: string;
  description: string;
  category: string;
  icon: typeof Mail;
}> = [
  {
    key: "gmail",
    name: "Gmail",
    description: "Surface conversations and relationship history.",
    category: "Email",
    icon: Mail,
  },
  {
    key: "google_calendar",
    name: "Google Calendar",
    description: "Use meetings to strengthen relationship context.",
    category: "Calendar",
    icon: CalendarDays,
  },
  {
    key: "google_sheets",
    name: "Google Sheets",
    description: "Bring in structured lists and pipeline data.",
    category: "Data",
    icon: Sheet,
  },
];

const crmConnectors = ["HubSpot", "Salesforce", "Attio"];

export function StepConnections({ state, update, onBack, onNext, meta }: StepConnectionsProps) {
  const { getAccessToken } = useAuth();
  const { activeContextId, availableContexts, isReady } = useActiveContext();
  const personalContextId =
    availableContexts.find((context) => context.kind === "personal")?.ownerContextId ?? activeContextId;
  const canConnect = isReady && isOwnerContextUuid(personalContextId);
  const { data: accounts = [], isLoading } = useConnectedAccounts(personalContextId);
  const [connecting, setConnecting] = useState<LiveConnector | null>(null);

  const connectedIntegrations = useMemo(
    () =>
      Array.from(
        new Set(
          accounts
            .filter((account) => account.status === "active")
            .map((account) => account.provider)
            .filter((provider): provider is LiveConnector =>
              liveConnectors.some((connector) => connector.key === provider),
            ),
        ),
      ),
    [accounts],
  );

  useEffect(() => {
    const previous = [...state.connectedIntegrations].sort().join("|");
    const current = [...connectedIntegrations].sort().join("|");
    if (previous !== current) update({ connectedIntegrations });
  }, [connectedIntegrations, state.connectedIntegrations, update]);

  const connect = async (key: LiveConnector) => {
    if (!canConnect) {
      toast({
        title: "Connections are still getting ready",
        description: "Wait a moment for your personal workspace to load, then try again.",
        variant: "destructive",
      });
      return;
    }

    setConnecting(key);
    const params = { ownerContextId: personalContextId, getToken: getAccessToken };
    const result =
      key === "google_calendar"
        ? await startGoogleCalendarOAuthRedirect(params)
        : key === "google_sheets"
          ? await startGoogleSheetsOAuthRedirect(params)
          : await startGoogleOAuthRedirect({ ...params, connector: "gmail" });

    if (!result.ok) {
      setConnecting(null);
      toast({ title: "Couldn't start connection", description: result.message, variant: "destructive" });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="min-w-0 w-full"
    >
      <div className="mb-7">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{meta?.eyebrow ?? "Connections"}</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {meta?.title ?? "Bring your network into focus"}
        </h1>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          {meta?.subtitle ?? "Connect the tools you already use so Vekta can uncover stronger relationships, conversations, and opportunities."}
        </p>
      </div>

      <div className="space-y-3">
        {liveConnectors.map(({ key, name, description, category, icon: Icon }) => {
          const connected = connectedIntegrations.includes(key);
          const busy = connecting === key;
          return (
            <div
              key={key}
              className={cn(
                "flex min-w-0 flex-col gap-4 overflow-hidden rounded-xl border bg-background/55 p-4 transition-colors sm:flex-row sm:items-center",
                connected ? "border-success/40" : "border-border/80 hover:border-primary/35",
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{name}</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {category}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={connected ? "outline" : "default"}
                disabled={connected || busy || isLoading || !canConnect}
                onClick={() => void connect(key)}
                className="h-9 min-w-28 gap-2"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : connected ? <Check className="h-3.5 w-3.5 text-success" /> : null}
                {connected ? "Connected" : busy ? "Connecting" : "Connect"}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl border border-border/70 bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
            <Database className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">CRM</p>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                Coming soon
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              HubSpot, Salesforce, and Attio connections are being prepared.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {crmConnectors.map((name) => (
                <span key={name} className="rounded-md border border-border bg-background/60 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={Boolean(connecting)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button type="button" variant="ghost" onClick={() => onNext(connectedIntegrations)} disabled={Boolean(connecting)}>
            Skip for now
          </Button>
          <Button type="button" onClick={() => onNext(connectedIntegrations)} disabled={Boolean(connecting)} className="gap-2">
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="mt-4 text-center text-[10px] leading-5 text-muted-foreground">
        Connections are optional. You can add or manage them later in Settings.
      </p>
    </motion.div>
  );
}
