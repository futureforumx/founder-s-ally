import { useState } from "react";
import { Building2, ChevronDown, ChevronUp, Upload, Check } from "lucide-react";

const stages = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+"];
const sectors = [
  "SaaS / B2B Software",
  "Fintech",
  "Health Tech",
  "Consumer / D2C",
  "AI / ML",
  "Climate Tech",
  "Marketplace",
  "Developer Tools",
  "Edtech",
  "Other",
];

export interface CompanyData {
  name: string;
  stage: string;
  sector: string;
  description: string;
  website: string;
  teamSize: string;
}

interface CompanyProfileProps {
  onSave?: (data: CompanyData) => void;
}

export function CompanyProfile({ onSave }: CompanyProfileProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [form, setForm] = useState<CompanyData>({
    name: "",
    stage: "",
    sector: "",
    description: "",
    website: "",
    teamSize: "",
  });

  const update = (field: keyof CompanyData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setIsSaved(false);
  };

  const canSave = form.name.trim() && form.stage && form.sector;

  const handleSave = () => {
    if (!canSave) return;
    setIsSaved(true);
    onSave?.(form);
  };

  return (
    <div className="surface-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-5"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
            <Building2 className="h-4 w-4 text-accent" />
          </div>
          <div className="text-left">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              {form.name || "Company Profile"}
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {form.stage && form.sector
                ? `${form.stage} · ${form.sector}`
                : "Add your company details to personalize benchmarks"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSaved && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-success">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border px-5 pb-5 pt-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Company Name */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Company Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Acme Corp"
                maxLength={100}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors"
              />
            </div>

            {/* Website */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Website
              </label>
              <input
                type="url"
                value={form.website}
                onChange={(e) => update("website", e.target.value)}
                placeholder="https://acme.com"
                maxLength={255}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors"
              />
            </div>

            {/* Stage */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Stage *
              </label>
              <select
                value={form.stage}
                onChange={(e) => update("stage", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors appearance-none"
              >
                <option value="" disabled>
                  Select stage
                </option>
                {stages.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Sector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Sector *
              </label>
              <select
                value={form.sector}
                onChange={(e) => update("sector", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors appearance-none"
              >
                <option value="" disabled>
                  Select sector
                </option>
                {sectors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Team Size */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Team Size
              </label>
              <input
                type="text"
                value={form.teamSize}
                onChange={(e) => update("teamSize", e.target.value)}
                placeholder="e.g. 12"
                maxLength={20}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5 col-span-2">
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                One-liner
              </label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="What does your company do in one sentence?"
                maxLength={200}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save Profile
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
