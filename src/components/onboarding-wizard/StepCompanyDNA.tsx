import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Upload, X, Loader2, Building2, UserPlus, Plus, Search, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { normalizeDomain } from "@/utils/company-utils";
import { FirmLogo } from "@/components/ui/firm-logo";
import { TaxonomyCombobox } from "@/components/company-profile/TaxonomyCombobox";
import { SECTOR_OPTIONS as SYSTEM_SECTOR_OPTIONS } from "@/constants/taxonomy";
import { supabase } from "@/integrations/supabase/client";
import { uploadR2UserAsset } from "@/lib/r2UserAssets";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { STAGES, type OnboardingState } from "./types";

interface StepCompanyDNAProps {
  state: OnboardingState;
  update: (p: Partial<OnboardingState>) => void;
  onNext: (companyName?: string, existingCompanyId?: string) => void;
  onBack: () => void;
}

interface CompanyResult {
  id: string;
  name: string;
  websiteUrl: string | null;
  sector: string | null;
  stage: string | null;
  inDatabase: boolean;
  isClaimed: boolean;
}

const TLDS = [".com", ".io", ".ai", ".org", ".net", ".co", ".dev", ".app", ".xyz", ".tech"];

function extractDomain(url: string): string | null {
  return normalizeDomain(url) || null;
}

export function StepCompanyDNA({ state, update, onNext, onBack }: StepCompanyDNAProps) {
  const [showNewCompanyModal, setShowNewCompanyModal] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState(state.companyName || "");
  const [searchResults, setSearchResults] = useState<CompanyResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyResult | null>(() =>
    state.existingCompanyId && state.companyName
      ? {
          id: state.existingCompanyId,
          name: state.companyName,
          websiteUrl: state.websiteUrl || null,
          sector: state.sectors?.[0] || null,
          stage: state.stage || null,
          inDatabase: true,
          isClaimed: true,
        }
      : null,
  );
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [isWebsiteSuggested, setIsWebsiteSuggested] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const isJoinMode = selectedCompany?.inDatabase === true;
  const websiteDomain = extractDomain(state.websiteUrl);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  // Debounced search
  const searchCompanies = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-companies", {
        body: { query: query.trim() },
      });

      if (error) throw error;
      const results: CompanyResult[] = data?.results || [];
      setSearchResults(results);
      setShowDropdown(true);
    } catch (e) {
      console.error("Company search failed:", e);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    update({ companyName: val });

    // Clear selected company (and its stored id) when typing
    if (selectedCompany) {
      setSelectedCompany(null);
      update({ existingCompanyId: "" });
    }

    // Debounce search
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchCompanies(val), 300);
  };

  const handleSelectCompany = (company: CompanyResult) => {
    setSelectedCompany(company);
    setSearchQuery(company.name);
    const pulledWebsite = company.websiteUrl || state.websiteUrl;
    setIsWebsiteSuggested(Boolean(company.websiteUrl));
    update({
      companyName: company.name,
      websiteUrl: pulledWebsite,
      stage: company.stage || state.stage,
      sectors: company.sector ? [company.sector] : state.sectors,
      // Store the real DB id when joining an existing company; clear for new ones
      existingCompanyId: company.inDatabase ? company.id : "",
    });

    // Immediately save to localStorage so it's available for OnboardingStepper
    // (avoids race condition with async setState)
    try {
      localStorage.setItem("pending-company-seed", JSON.stringify({
        companyName: company.name,
        websiteUrl: company.websiteUrl || state.websiteUrl,
        deckText: state.deckText || "",
        stage: state.stage || "",
        sectors: state.sectors || [],
      }));
    } catch {
      // Local persistence is best-effort; remote onboarding checkpoints still apply.
    }

    setShowDropdown(false);
  };

  const handleClearSelection = () => {
    setSelectedCompany(null);
    setSearchQuery("");
    setIsWebsiteSuggested(false);
    update({ companyName: "", websiteUrl: "", existingCompanyId: "" });
    // Clear the seed when company is cleared
    try {
      localStorage.removeItem("pending-company-seed");
    } catch {
      // Ignore unavailable local storage.
    }
  };

  const handleContinue = () => {
    // Always commit whatever is typed in the search box to state before proceeding,
    // so the company name reliably reaches the pending-company-seed written by handleFinish.
    const nameToCommit = selectedCompany?.name || searchQuery.trim();
    if (nameToCommit && nameToCommit !== state.companyName) {
      update({ companyName: nameToCommit });
    }

    if (isJoinMode) {
      setShowJoinModal(true);
    } else {
      // Pass name directly so handleFinish gets it even before React state settles.
      // Clear existingCompanyId — this is a brand-new company.
      onNext(nameToCommit || state.companyName, "");
    }
  };

  const handleNewCompanyConfirm = () => {
    setShowNewCompanyModal(false);
    onNext(selectedCompany?.name || searchQuery.trim() || state.companyName, "");
  };

  const handleJoinConfirm = async () => {
    const companyName = selectedCompany?.name || searchQuery.trim() || state.companyName;
    // Pass the existing company's real DB id so handleFinish links the user to it
    // instead of creating a new company_analyses row with the same name.
    const existingId = selectedCompany?.inDatabase ? selectedCompany.id : "";
    setShowJoinModal(false);
    onNext(companyName, existingId);
  };

  const handleLogoFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Choose an image", description: "Upload a PNG, JPG, WebP, or SVG logo.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Logo is too large", description: "Choose an image under 5 MB.", variant: "destructive" });
      return;
    }

    setIsUploadingLogo(true);
    try {
      const uploaded = await uploadR2UserAsset("company-logo", file);
      update({ companyLogoUrl: uploaded.url });
      toast({ title: "Logo replaced", description: "Your uploaded logo will override the website favicon." });
    } catch (error) {
      toast({
        title: "Couldn't upload logo",
        description: error instanceof Error ? error.message : "Try another image.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const renderLogoPreview = () => (
    <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
      <FirmLogo
        firmName={selectedCompany?.name || searchQuery.trim() || state.companyName || websiteDomain || "Company"}
        logoUrl={state.companyLogoUrl || null}
        websiteUrl={state.websiteUrl}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">
          {state.companyLogoUrl ? "Custom logo" : "Logo pulled from website"}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">
          {state.companyLogoUrl ? "Overrides the website favicon" : websiteDomain}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 shrink-0 gap-1.5 px-2.5 text-xs text-primary hover:text-primary"
        disabled={isUploadingLogo}
        onClick={() => logoInputRef.current?.click()}
      >
        {isUploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {isUploadingLogo ? "Uploading" : "Replace"}
      </Button>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-lg mx-auto space-y-5"
    >
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Your Company</h1>
        <p className="text-sm text-muted-foreground">We'll use these to build your company profile.</p>
      </div>

      <div className="space-y-4">
        {/* Company Name — Smart Search */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Company Name
          </label>
          <div ref={searchContainerRef} className="relative">
            {selectedCompany ? (
              <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
                <FirmLogo
                  firmName={selectedCompany.name}
                  websiteUrl={selectedCompany.websiteUrl}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{selectedCompany.name}</p>
                  {selectedCompany.sector && (
                    <p className="text-[10px] text-muted-foreground">{selectedCompany.sector}</p>
                  )}
                </div>
                {selectedCompany.inDatabase ? (
                  <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-accent font-bold">
                    <Building2 className="h-3 w-3" /> In Network
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    <Plus className="h-3 w-3" /> New
                  </span>
                )}
                <button
                  onClick={handleClearSelection}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                  placeholder="Search or type company name..."
                  className="pl-10 pr-8"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            )}

            {/* Search Results Dropdown */}
            <AnimatePresence>
              {showDropdown && !selectedCompany && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover/95 backdrop-blur-xl shadow-lg max-h-[220px] overflow-y-auto"
                >
                  {searchResults.map((company) => (
                    <button
                      key={company.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); handleSelectCompany(company); }}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/10 transition-colors"
                    >
                      <FirmLogo firmName={company.name} websiteUrl={company.websiteUrl} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{company.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {[company.sector, company.stage].filter(Boolean).join(" · ") || "New company"}
                        </p>
                      </div>
                      {company.inDatabase && (
                        <span className="text-[9px] font-mono uppercase tracking-wider text-accent font-bold bg-accent/10 px-1.5 py-0.5 rounded">
                          Exists
                        </span>
                      )}
                    </button>
                  ))}

                  {/* Always show "Add as new" option */}
                  {searchQuery.trim().length >= 2 && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectCompany({
                          id: `new-${Date.now()}`,
                          name: searchQuery.trim(),
                          websiteUrl: null,
                          sector: null,
                          stage: null,
                          inDatabase: false,
                          isClaimed: false,
                        });
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/10 transition-colors border-t border-border/50"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                        <Plus className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-sm text-foreground">
                        Add <span className="font-semibold">"{searchQuery.trim()}"</span> as new company
                      </p>
                    </button>
                  )}

                  {searchResults.length === 0 && searchQuery.trim().length >= 2 && !isSearching && (
                    <div className="px-3 py-3 text-center text-xs text-muted-foreground">
                      No companies found — add as new above
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {isJoinMode && (
          <div role="status" className="flex gap-3 rounded-xl border border-primary/25 bg-primary/[0.07] p-3.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-semibold text-foreground">This company portal already exists</p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                Continue to request access from a company admin. Your account will remain pending until an admin approves it.
              </p>
            </div>
          </div>
        )}

        {/* Website URL */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Website <span className="normal-case text-muted-foreground/50">(optional)</span>
          </label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
            <Input
              value={state.websiteUrl}
              onChange={(e) => {
                if (isWebsiteSuggested) setIsWebsiteSuggested(false);
                update({ websiteUrl: e.target.value });
              }}
              placeholder="https://yourcompany.com"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              className={cn("pl-10", isWebsiteSuggested && "text-[#6C44FC]")}
            />
          </div>
          {isWebsiteSuggested && (
            <p className="text-[11px] font-medium text-[#6C44FC]">Is this your correct URL?</p>
          )}
          {websiteDomain && (
            renderLogoPreview()
          )}
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Stage <span className="text-primary">*</span>
          </label>
          <div role="radiogroup" aria-label="Company stage" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STAGES.map((stage) => {
              const selected = state.stage === stage;
              return (
                <button
                  key={stage}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => update({ stage })}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                    selected
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/80 bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  {stage}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Sector <span className="text-primary">*</span>
          </label>
          <TaxonomyCombobox
            options={SYSTEM_SECTOR_OPTIONS}
            value={state.sectors[0] || ""}
            onChange={(sector) => update({ sectors: sector ? [sector] : [] })}
            placeholder="Type a sector or keyword…"
            allowCustom={false}
          />
          <p className="text-[10px] leading-4 text-muted-foreground">
            Search by keywords like payments, LLM, logistics, healthcare, or creator.
          </p>
        </div>

      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>
        <Button
          size="sm"
          onClick={handleContinue}
          disabled={!(searchQuery.trim() || state.companyName.trim()) || !state.stage || !state.sectors[0]}
        >
          {isJoinMode ? (
            <><UserPlus className="h-3.5 w-3.5 mr-1" /> Request portal access</>
          ) : (
            <><Plus className="h-3.5 w-3.5 mr-1" /> Add Company</>
          )}
        </Button>
      </div>

      {/* Join Request Modal */}
      <Dialog open={showJoinModal} onOpenChange={setShowJoinModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-accent" />
              Request access to {selectedCompany?.name}
            </DialogTitle>
            <DialogDescription>
              Your request will be sent to a company admin. You will not receive portal access until an admin approves it.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setShowJoinModal(false)}>Cancel</Button>
            <Button size="sm" onClick={handleJoinConfirm}>
              Send access request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Company Setup Modal */}
      <Dialog open={showNewCompanyModal} onOpenChange={setShowNewCompanyModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Set up {selectedCompany?.name || state.companyName}
            </DialogTitle>
            <DialogDescription>
              Add a few details to build your company profile. You can always update these later in Settings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Website URL */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Website URL
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input
                  value={state.websiteUrl}
                  onChange={(e) => {
                    if (isWebsiteSuggested) setIsWebsiteSuggested(false);
                    update({ websiteUrl: e.target.value });
                  }}
                  placeholder="https://yourcompany.com"
                  className={cn(
                    "pl-10",
                    isWebsiteSuggested && "text-[#6C44FC]"
                  )}
                />
              </div>
              {isWebsiteSuggested && (
                <p className="text-[11px] font-medium text-[#6C44FC]">is this your correct URL?</p>
              )}
              {websiteDomain && (
                renderLogoPreview()
              )}
            </div>

          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setShowNewCompanyModal(false)}>Back</Button>
            <Button size="sm" onClick={handleNewCompanyConfirm}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Create & Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <input
        ref={logoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleLogoFile(file);
        }}
      />
    </motion.div>
  );
}
