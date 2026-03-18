import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { CompanyProfile } from "@/components/CompanyProfile";
import { HealthDashboard } from "@/components/HealthDashboard";
import { DeckAuditView } from "@/components/DeckAuditView";

const Index = () => {
  const [activeView, setActiveView] = useState<"dashboard" | "audit">("dashboard");

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-6">
          {activeView === "dashboard" ? (
            <div className="space-y-6">
              <CompanyProfile />
              <HealthDashboard />
            </div>
          ) : (
            <DeckAuditView />
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
