import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { TaxonomyCombobox } from "@/components/company-profile/TaxonomyCombobox";
import { companyGeoFromProfile } from "@/lib/resolveCompanyGeo";
import {
  normalizeBusinessModel,
  normalizeTargetCustomer,
} from "@/components/company-profile/sectorNormalization";
import { useCompanyProfileFields, type ProfileFields } from "@/hooks/useCompanyProfileFields";
import {
  STAGE_OPTIONS,
  SECTOR_OPTIONS,
  BUSINESS_MODEL_OPTIONS,
  TARGET_CUSTOMER_OPTIONS,
  GEO_OPTIONS,
  type TaxonomyOption,
} from "@/constants/taxonomy";

const ENTIRE_SECTOR = "Entire Sector";

/** Curated subset of a shared taxonomy list, in the order given. */
function pick(options: TaxonomyOption[], labels: string[]): TaxonomyOption[] {
  return labels
    .map((label) => options.find((o) => o.label === label))
    .filter((o): o is TaxonomyOption => Boolean(o));
}

const ROUND_OPTIONS = pick(STAGE_OPTIONS, ["Accelerator", "Pre-Seed", "Seed", "Series A"]);
const MONETIZATION_OPTIONS = pick(BUSINESS_MODEL_OPTIONS, [
  "SaaS",
  "Marketplace",
  "E-Commerce",
  "Transaction/Fintech",
  "Freemium",
  "Usage-Based",
]);
const CUSTOMER_TYPE_LABELS = ["B2B", "B2B2C", "B2C", "D2C"];
const CUSTOMER_SIZE_LABELS = ["SMB", "Enterprise"];
/** Company size is only a meaningful question when there's a business on the other side. */
const SIZED_CUSTOMER_TYPES = ["B2B", "B2B2C"];

const CUSTOMER_OPTIONS = pick(TARGET_CUSTOMER_OPTIONS, CUSTOMER_TYPE_LABELS);
const CUSTOMER_SIZE_OPTIONS = pick(TARGET_CUSTOMER_OPTIONS, CUSTOMER_SIZE_LABELS);

/** "Entire Sector" plus the industries that belong to the chosen sector. */
function industryOptionsFor(sector: string): TaxonomyOption[] {
  const entire: TaxonomyOption = {
    label: ENTIRE_SECTOR,
    description: sector ? `Everything in ${sector}` : "No narrowing",
    search_tags: ["all", "entire", "any", "whole sector"],
  };
  const industries = (SECTOR_OPTIONS.find((o) => o.label === sector)?.default_subsectors ?? []).map(
    (label) => ({ label, search_tags: [label.toLowerCase()] }),
  );
  return [entire, ...industries];
}

/** First entry of a stored multi-select, mapped onto its canonical label. */
function first(values: string[] | undefined, normalize: (raw: string) => string | null): string {
  const raw = values?.[0]?.trim();
  if (!raw) return "";
  return normalize(raw) ?? raw;
}

/**
 * Target customer holds both a type and an optional company size. Values are
 * matched by role rather than position, since nothing guarantees their order.
 */
function splitTargetCustomer(values: string[] | undefined) {
  const all = (values ?? [])
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => normalizeTargetCustomer(v) ?? v);
  return {
    type: all.find((v) => CUSTOMER_TYPE_LABELS.includes(v)) ?? "",
    size: all.find((v) => CUSTOMER_SIZE_LABELS.includes(v)) ?? "",
    // Choices this panel doesn't surface (Government, Prosumer) are carried
    // through so editing here doesn't wipe what was set in Settings.
    rest: all.filter(
      (v) => !CUSTOMER_TYPE_LABELS.includes(v) && !CUSTOMER_SIZE_LABELS.includes(v),
    ),
  };
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

export function CompanyPanel() {
  const { profile, patch } = useCompanyProfileFields();
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const commit = (changes: ProfileFields) => {
    patch(changes);
    setJustSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setJustSaved(false), 1800);
  };

  const sector = profile.sector?.trim() ?? "";
  const industry = profile.industry?.trim() || ENTIRE_SECTOR;
  // Normalize on read so profiles holding pre-rename labels ("B2B SaaS") still
  // line up with an option instead of showing as a stray custom value.
  const monetization = first(profile.businessModel, normalizeBusinessModel);
  const customer = splitTargetCustomer(profile.targetCustomer);
  const showCustomerSize = SIZED_CUSTOMER_TYPES.includes(customer.type);
  const companyName = profile.name?.trim() ?? "";

  const commitCustomer = (type: string, size: string) => {
    commit({
      targetCustomer: [type, SIZED_CUSTOMER_TYPES.includes(type) ? size : "", ...customer.rest]
        .filter(Boolean),
    });
  };

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-16 gap-y-6">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Company Details
          </span>
          {justSaved && (
            <span className="inline-flex items-center gap-1 text-[11px] text-success">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
        </div>
        <h2 className="truncate text-[32px] font-semibold leading-9 tracking-[-0.02em] text-foreground">
          {companyName || <span className="text-muted-foreground">Your company</span>}
        </h2>
      </div>

      <div className="flex flex-wrap items-end gap-x-7 gap-y-4">
        <Fact label="Round">
          <TaxonomyCombobox
            variant="plain"
            options={ROUND_OPTIONS}
            value={profile.stage?.trim() ?? ""}
            onChange={(value) => commit({ stage: value })}
            placeholder="Select…"
            allowCustom={false}
          />
        </Fact>

        <Fact label="Model">
          <TaxonomyCombobox
            variant="plain"
            options={MONETIZATION_OPTIONS}
            value={monetization}
            onChange={(value) => commit({ businessModel: value ? [value] : [] })}
            placeholder="Select…"
            allowCustom={false}
          />
        </Fact>

        <Fact label="Customer">
          <div className="flex items-center gap-1.5">
            <TaxonomyCombobox
              variant="plain"
              options={CUSTOMER_OPTIONS}
              value={customer.type}
              onChange={(value) => commitCustomer(value, customer.size)}
              placeholder="Select…"
              allowCustom={false}
            />
            {showCustomerSize && (
              <>
                <span className="text-sm font-medium text-muted-foreground">·</span>
                <TaxonomyCombobox
                  variant="plain"
                  options={CUSTOMER_SIZE_OPTIONS}
                  value={customer.size}
                  onChange={(value) => commitCustomer(customer.type, value)}
                  placeholder="Size…"
                  allowCustom={false}
                />
              </>
            )}
          </div>
        </Fact>

        <Fact label="Sector">
          <TaxonomyCombobox
            variant="plain"
            options={SECTOR_OPTIONS}
            value={sector}
            onChange={(value) => commit({ sector: value, industry: "" })}
            placeholder="Select…"
            allowCustom={false}
          />
        </Fact>

        <Fact label="Industry">
          <TaxonomyCombobox
            variant="plain"
            options={industryOptionsFor(sector)}
            value={industry}
            onChange={(value) =>
              commit({ industry: !value || value === ENTIRE_SECTOR ? "" : value })
            }
            placeholder="Select…"
            allowCustom={false}
          />
        </Fact>

        <Fact label="Geo">
          <TaxonomyCombobox
            variant="plain"
            options={GEO_OPTIONS}
            value={companyGeoFromProfile(profile)}
            onChange={(value) => commit({ geo: value })}
            placeholder="Select…"
            allowCustom={false}
          />
        </Fact>
      </div>
    </div>
  );
}

export default CompanyPanel;
