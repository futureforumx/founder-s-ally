import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Upload, FileText, X, Loader2, Building2, UserPlus, Plus, Search, KeyRound, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  onNext: () => void;
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
  try {
    let u = url.trim();
    if (!u) return null;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    const hostname = new URL(u).hostname.replace(/^www\./, "");
    return hostname || null;
  } catch { return null; }
}

function faviconSrc(domain: string): string {
  return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=32`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StepCompanyDNA({ state, update, onNext, onBack }: StepCompanyDNAProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [deckFile, setDeckFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState(state.companyName || "");
  const [searchResults, setSearchResults] = useState<CompanyResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyResult | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
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

    // Clear selected company when typing
    if (selectedCompany) {
      setSelectedCompany(null);
    }

    // Debounce search
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchCompanies(val), 300);
  };

  const handleSelectCompany = (company: CompanyResult) => {
    setSelectedCompany(company);
    setSearchQuery(company.name);
    update({
      companyName: company.name,
      websiteUrl: company.websiteUrl || state.websiteUrl,
    });
    setShowDropdown(false);
  };

  const handleClearSelection = () => {
    setSelectedCompany(null);
    setSearchQuery("");
    update({ companyName: "", websiteUrl: "" });
  };

  const handleContinue = () => {
    if (isJoinMode) {
      setShowJoinModal(true);
    } else {
      onNext();
    }
  };

  const handleJoinConfirm = async () => {
    // If valid approval code was entered, auto-approve by adding as member
    if (codeStatus === "valid" && selectedCompany) {
      // The code was already validated — proceed directly
      setShowJoinModal(false);
      onNext();
      return;
    }
    // Otherwise proceed as a pending request
    setShowJoinModal(false);
    onNext();
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
      const pdfjsLib = await import("pdfjs-dist");
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

      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>
        <Button size="sm" onClick={handleContinue} disabled={!state.companyName.trim()}>
          {isJoinMode ? (
            <><UserPlus className="h-3.5 w-3.5 mr-1" /> Join Company</>
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
              Join {selectedCompany?.name}
            </DialogTitle>
            <DialogDescription>
              You are requesting to join <strong>{selectedCompany?.name}</strong>. An admin will be notified and can approve your request.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setShowJoinModal(false)}>Cancel</Button>
            <Button size="sm" onClick={handleJoinConfirm}>Confirm & Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
