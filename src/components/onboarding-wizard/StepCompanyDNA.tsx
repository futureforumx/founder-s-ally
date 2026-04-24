import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Upload, FileText, X, Loader2, Building2, UserPlus, Plus, Search, KeyRound, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { normalizeDomain, getFaviconUrl } from "@/utils/company-utils";
import { FirmLogo } from "@/components/ui/firm-logo";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { OnboardingState } from "./types";

interface StepCompanyDNAProps {
  state: OnboardingState;
  update: (p: Partial<OnboardingState>) => void;
  onNext: (companyName?: string, existingCompanyId?: string) => void;
  onBack: () => void;
  saving?: boolean;
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

function faviconSrc(domain: string): string {
  return getFaviconUrl(domain, 64);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StepCompanyDNA({ state, update, onNext, onBack, saving = false }: StepCompanyDNAProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [showNewCompanyModal, setShowNewCompanyModal] = useState(false);
  const [deckFile, setDeckFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState(state.companyName || "");
  const [searchResults, setSearchResults] = useState<CompanyResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyResult | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [isWebsiteSuggested, setIsWebsiteSuggested] = useState(false);
  const [approvalCode, setApprovalCode] = useState("");
  const [codeStatus, setCodeStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
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
    } catch {}

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
    } catch {}
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

  const validateApprovalCode = useCallback(async (code: string) => {
    if (!code.trim() || !selectedCompany) return;
    setCodeStatus("checking");
    try {
      const { data, error } = await (supabase as any)
        .from("company_approval_codes")
        .select("id, company_id")
        .eq("code", code.trim().toUpperCase())
        .eq("company_id", selectedCompany.id)
        .eq("is_active", true)
        .gte("expires_at", new Date().toISOString())
        .maybeSingle();

      if (error || !data) {
        setCodeStatus("invalid");
      } else {
        setCodeStatus("valid");
      }
    } catch {
      setCodeStatus("invalid");
    }
  }, [selectedCompany]);

  const extractTextFromFile = useCallback(async (file: File): Promise<string> => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".txt") || name.endsWith(".md")) {
      return await file.text();
    }
    if (name.endsWith(".pdf")) {
      const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ");
        pages.push(`[Slide ${String(i).padStart(2, "0")}]\n${text}`);
      }
      return pages.join("\n\n");
    }
    throw new Error("Unsupported file type.");
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (file.size > 50 * 1024 * 1024) return;
    setDeckFile(file);
    setIsExtracting(true);
    try {
      const text = await extractTextFromFile(file);
      update({ deckText: text, deckFileName: file.name });
    } catch {
      update({ deckText: "", deckFileName: file.name });
    } finally {
      setIsExtracting(false);
    }
  }, [extractTextFromFile, update]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const removeDeck = () => {
    setDeckFile(null);
    update({ deckText: "", deckFileName: "" });
  };

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
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <img src={faviconSrc(websiteDomain)} alt="" className="h-3 w-3 rounded-sm" />
              {websiteDomain}
            </div>
          )}
        </div>

      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>
        <Button
          size="sm"
          onClick={handleContinue}
          disabled={saving || !(searchQuery.trim() || state.companyName.trim())}
        >
          {saving ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving…</>
          ) : isJoinMode ? (
            <><UserPlus className="h-3.5 w-3.5 mr-1" /> Join Company</>
          ) : (
            <><Plus className="h-3.5 w-3.5 mr-1" /> Add Company</>
          )}
        </Button>
      </div>

      {/* Join Request Modal */}
      <Dialog open={showJoinModal} onOpenChange={(open) => { setShowJoinModal(open); if (!open) { setApprovalCode(""); setCodeStatus("idle"); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-accent" />
              Join {selectedCompany?.name}
            </DialogTitle>
            <DialogDescription>
              You are requesting to join <strong>{selectedCompany?.name}</strong>. An admin will be notified and can approve your request.
            </DialogDescription>
          </DialogHeader>

          {/* Approval Code Section */}
          <div className="space-y-2 py-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Have the approval code? Input here.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                <Input
                  value={approvalCode}
                  onChange={(e) => { setApprovalCode(e.target.value.toUpperCase()); setCodeStatus("idle"); }}
                  placeholder="e.g. A1B2C3D4"
                  className={cn(
                    "pl-9 font-mono text-sm tracking-wider uppercase",
                    codeStatus === "valid" && "border-green-500/50 bg-green-500/5",
                    codeStatus === "invalid" && "border-destructive/50 bg-destructive/5",
                  )}
                  maxLength={12}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => validateApprovalCode(approvalCode)}
                disabled={!approvalCode.trim() || codeStatus === "checking"}
                className="shrink-0"
              >
                {codeStatus === "checking" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : codeStatus === "valid" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  "Verify"
                )}
              </Button>
            </div>
            {codeStatus === "valid" && (
              <p className="text-[10px] text-green-500 font-medium">✓ Code verified — you'll be auto-approved.</p>
            )}
            {codeStatus === "invalid" && (
              <p className="text-[10px] text-destructive font-medium">Invalid or expired code. You can still request to join below.</p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setShowJoinModal(false)}>Cancel</Button>
            <Button size="sm" onClick={handleJoinConfirm}>
              {codeStatus === "valid" ? "Join & Continue" : "Confirm & Continue"}
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
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <img src={faviconSrc(websiteDomain)} alt="" className="h-3 w-3 rounded-sm" />
                  {websiteDomain}
                </div>
              )}
            </div>

            {/* Pitch Deck Upload */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Pitch Deck <span className="text-muted-foreground/50 normal-case">(optional)</span>
              </label>
              {deckFile || state.deckFileName ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{deckFile?.name || state.deckFileName}</p>
                    {deckFile && (
                      <p className="text-[10px] text-muted-foreground">{formatFileSize(deckFile.size)}</p>
                    )}
                  </div>
                  {isExtracting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <button onClick={removeDeck} className="text-muted-foreground hover:text-destructive transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 cursor-pointer transition-colors",
                    isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/20"
                  )}
                >
                  <Upload className="h-5 w-5 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">
                    Drop your deck here or <span className="text-primary font-medium">browse</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground/50">PDF up to 50 MB</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
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
    </motion.div>
  );
}
