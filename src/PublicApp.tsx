import { Navigate, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import ToolsLibraryPage from "@/pages/tools/ToolsLibraryPage";
import ToolsCategoryPage from "@/pages/tools/ToolsCategoryPage";
import ToolDetailPage from "@/pages/tools/ToolDetailPage";

export default function PublicApp() {
  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Routes>
        <Route path="/AI-AGENTS" element={<Navigate to="/tools/ai-agents" replace />} />
        <Route path="/ai-agents" element={<Navigate to="/tools/ai-agents" replace />} />
        <Route path="/tools" element={<ToolsLibraryPage />} />
        <Route path="/tools/ai-agents" element={<ToolsCategoryPage category="AI Agents" />} />
        <Route path="/tools/ai-models" element={<ToolsCategoryPage category="AI Models" />} />
        <Route path="/tools/ai-skills" element={<ToolsCategoryPage category="AI Skills" />} />
        <Route path="/tools/startup-tools" element={<ToolsCategoryPage category="Startup Tools" />} />
        <Route path="/tools/:slug" element={<ToolDetailPage />} />
      </Routes>
    </TooltipProvider>
  );
}
