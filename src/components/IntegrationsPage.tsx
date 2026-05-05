import { IntegrationsManagePanel } from "@/components/SettingsPage";

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Integrations</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Connect CRM, calendar, sheets, and other data sources for your workspace.
        </p>
      </div>
      <IntegrationsManagePanel />
    </div>
  );
}
