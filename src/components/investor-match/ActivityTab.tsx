import { Kanban, ArrowRight } from "lucide-react";

export function ActivityTab() {
  return (
    <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-10 text-center shadow-sm">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary mx-auto mb-4">
        <Kanban className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">Pipeline & CRM</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed mb-6">
        Track your investor outreach, manage conversations, and monitor deal progression — all in one place. This view is coming soon.
      </p>
      <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-accent/50" />
          <span>Pipeline stages</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-success/50" />
          <span>Meeting tracking</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-warning/50" />
          <span>Follow-up reminders</span>
        </div>
      </div>
    </div>
  );
}
