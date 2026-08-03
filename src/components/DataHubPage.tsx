import { useState } from "react";
import { Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeckAuditView } from "./DeckAuditView";

const DATA_ROOM_TABS = [
  { id: "files" as const, label: "Files" },
  { id: "assessment" as const, label: "Assessment" },
  { id: "share" as const, label: "Share" },
];

type DataRoomTabId = (typeof DATA_ROOM_TABS)[number]["id"];

export function DataHubPage() {
  const [activeTab, setActiveTab] = useState<DataRoomTabId>("files");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-1 border-b border-border pb-2">
        {DATA_ROOM_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest rounded-md transition-all",
                isActive
                  ? "bg-accent/10 text-accent font-bold"
                  : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        {activeTab === "share" ? (
          <div className="flex flex-col items-center justify-center gap-2 min-h-[40vh] text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-card/70">
              <Share2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Sharing is coming soon</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              You'll be able to share your pitch deck and assessment with investors directly from here.
            </p>
          </div>
        ) : (
          <DeckAuditView activeSection={activeTab} />
        )}
      </div>
    </div>
  );
}

export default DataHubPage;
