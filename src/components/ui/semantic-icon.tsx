import { Activity, Bookmark, Building2, ChartNoAxesCombined, Check, CircleCheck, Clock3, Download, Eye, Globe, HeartHandshake, Layers3, Lightbulb, Search, Settings2, Sparkles, TriangleAlert, Users, Wallet } from "lucide-react";
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { safeIconName } from "@/components/admin/designStudioConfig";
import { usePublishedDesignConfig } from "@/lib/designStudioRuntime";

const icons: Record<string, ComponentType<LucideProps>> = { Activity, Bookmark, Building2, ChartNoAxesCombined, Check, CircleCheck, Clock3, Download, Eye, Globe, HeartHandshake, Layers3, Lightbulb, Search, Settings2, Sparkles, TriangleAlert, Users, Wallet };

/** Resolves an approved semantic role through the compiled Lucide adapter. */
export function SemanticIcon({ role, fallback = "Sparkles", ...props }: LucideProps & { role: string; fallback?: string }) {
  const config = usePublishedDesignConfig();
  const iconName = safeIconName(config.icons.mappings[role], fallback);
  const Icon = icons[iconName] ?? icons.Sparkles;
  return <Icon size={config.icons.size} strokeWidth={config.icons.strokeWidth} {...props} />;
}
