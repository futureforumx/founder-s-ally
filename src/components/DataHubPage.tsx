import { Database, FileText, Plug, Sparkles } from "lucide-react";

interface DataHubCard {
  title: string;
  description: string;
  icon: typeof Database;
}

const DATA_HUB_CARDS: DataHubCard[] = [
  {
    title: "Connected sources",
    description: "Manage the data feeds and integrations powering your workspace.",
    icon: Plug,
  },
  {
    title: "Documents & files",
    description: "Central store for decks, financials, and shared documents.",
    icon: FileText,
  },
  {
    title: "Enriched intelligence",
    description: "AI-enriched company, investor, and market datasets.",
    icon: Sparkles,
  },
];

export function DataHubPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-card/70">
          <Database className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Data Hub</h1>
          <p className="text-sm text-muted-foreground">
            Your workspace's connected data, documents, and enriched intelligence in one place.
          </p>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DATA_HUB_CARDS.map(({ title, description, icon: Icon }) => (
          <div
            key={title}
            className="rounded-2xl border border-border/60 bg-card/70 p-5 transition-colors hover:border-border"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-background/60">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <h2 className="mt-4 text-sm font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DataHubPage;
