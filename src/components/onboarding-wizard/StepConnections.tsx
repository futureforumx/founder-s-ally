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
import { useAuth, type OAuthProvider } from "@/hooks/useAuth";
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

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function LinkedInGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#0A66C2" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

const accountConnectors: Array<{
  provider: OAuthProvider;
  name: string;
  description: string;
  glyph: (props: { className?: string }) => JSX.Element;
}> = [
  {
    provider: "google",
    name: "Google",
    description: "Import your name, photo, and email — and sign in with Google next time.",
    glyph: GoogleGlyph,
  },
  {
    provider: "linkedin_oidc",
    name: "LinkedIn",
    description: "Import your professional profile — and sign in with LinkedIn next time.",
    glyph: LinkedInGlyph,
  },
];

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
  const { getAccessToken, user, linkOAuthIdentity } = useAuth();
  const { activeContextId, availableContexts, isReady } = useActiveContext();
  const personalContextId =
    availableContexts.find((context) => context.kind === "personal")?.ownerContextId ?? activeContextId;
  const canConnect = isReady && isOwnerContextUuid(personalContextId);
  const { data: accounts = [], isLoading } = useConnectedAccounts(personalContextId);
  const [connecting, setConnecting] = useState<LiveConnector | null>(null);
  const [linkingProvider, setLinkingProvider] = useState<OAuthProvider | null>(null);

  // Auth providers already linked to the account (e.g. signed up with Google/LinkedIn during registration).
  const linkedAuthProviders = useMemo(() => {
    const set = new Set<string>();
    for (const identity of user?.identities ?? []) {
      if (identity?.provider) set.add(identity.provider);
    }
    const appMeta = user?.app_metadata as { provider?: string; providers?: string[] } | undefined;
    if (appMeta?.provider) set.add(appMeta.provider);
    for (const provider of appMeta?.providers ?? []) set.add(provider);
    return set;
  }, [user]);

  const connectedIntegrations = useMemo(() => {
    const dataKeys = accounts
      .filter((account) => account.status === "active")
      .map((account) => account.provider)
      .filter((provider): provider is LiveConnector =>
        liveConnectors.some((connector) => connector.key === provider),
      );
    const authKeys = accountConnectors
      .filter((connector) => linkedAuthProviders.has(connector.provider))
      .map((connector) => connector.provider);
    return Array.from(new Set<string>([...dataKeys, ...authKeys]));
  }, [accounts, linkedAuthProviders]);

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

  const connectAccount = async (provider: OAuthProvider) => {
    const label = provider === "google" ? "Google" : "LinkedIn";
    setLinkingProvider(provider);
    try {
      // Redirects to the provider and returns to onboarding; onboarding progress is autosaved.
      await linkOAuthIdentity(provider);
    } catch (error) {
      setLinkingProvider(null);
      toast({
        title: `Couldn't connect ${label}`,
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
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

      {/* Sign-in accounts: connected during registration, or link now to import data + enable login. */}
      <div className="mb-3 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your accounts</p>
        {accountConnectors.map(({ provider, name, description, glyph: Glyph }) => {
          const connected = linkedAuthProviders.has(provider);
          const busy = linkingProvider === provider;
          return (
            <div
              key={provider}
              className={cn(
                "flex min-w-0 flex-col gap-4 overflow-hidden rounded-xl border bg-background/55 p-4 transition-colors sm:flex-row sm:items-center",
                connected ? "border-success/40" : "border-border/80 hover:border-primary/35",
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
                <Glyph className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{name}</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Account
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  {connected ? `Connected during sign-up — you can log in with ${name}.` : description}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={connected ? "outline" : "default"}
                disabled={connected || busy}
                onClick={() => void connectAccount(provider)}
                className="h-9 min-w-28 gap-2"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : connected ? <Check className="h-3.5 w-3.5 text-success" /> : null}
                {connected ? "Connected" : busy ? "Connecting" : "Connect"}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tools</p>
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
