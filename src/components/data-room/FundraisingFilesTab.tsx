import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, CircleAlert, Download, Eye, FileText, Film, Info, Link2, Loader2, MoreHorizontal, Pencil, Plus, Share2, Upload, X } from "lucide-react";
import { BouncingDots } from "@/components/loading-ui/bouncing-dots";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { FileUpload } from "@/components/ui/file-upload";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { getValidatedVideoEmbedUrl } from "@/lib/fundraisingVideo";
import {
  MAX_UPLOAD_BYTES, useFundraisingFiles, type FundraisingCategory, type FundraisingDocument, type FundraisingFileVersion,
  mimeFromName,
} from "@/hooks/useFundraisingFiles";

const CATEGORIES: FundraisingCategory[] = ["Pitch Deck", "One Pager", "Demo"];
const dateLabel = (date: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(date));
const shortDate = (date: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(date));
const formatSize = (bytes: number | null) => bytes == null ? null : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const sourceLabel = (version: FundraisingFileVersion) => version.source_kind === "video_link"
  ? version.external_url!
  : version.original_filename || "Uploaded file";
const documentSourceLabel = (version: FundraisingFileVersion) => version.source_kind === "video_link"
  ? new URL(version.external_url!).hostname.replace(/^www\./, "")
  : version.original_filename || "Uploaded file";
const currentVersion = (doc: FundraisingDocument) => doc.versions.find((version) => version.id === doc.current_version_id) ?? doc.versions[0] ?? null;
const fileType = (version: FundraisingFileVersion | null) => {
  if (!version) return "—";
  if (version.source_kind === "video_link") return "Video link";
  const extension = version.original_filename?.split(".").pop()?.toUpperCase();
  return extension || version.mime_type?.split("/").pop()?.toUpperCase() || "File";
};
const accepted = (category: FundraisingCategory) => category === "Demo" ? ".mp4,video/mp4" : ".pdf,.ppt,.pptx";

export function FundraisingFilesTab({ onShareDeck }: { onShareDeck?: (deckId: string) => void }) {
  const { documents, loading, loadError, refresh, createDocument, addUploadVersion, addVideoLinkVersion, renameDocument, updateCategory, makeCurrent, getPreviewUrl } = useFundraisingFiles();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "version">("create");
  const [sourceMode, setSourceMode] = useState<"upload" | "video_link">("upload");
  const [formCategory, setFormCategory] = useState<FundraisingCategory>("Pitch Deck");
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [draftDocument, setDraftDocument] = useState<FundraisingDocument | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [preview, setPreview] = useState<{ document: FundraisingDocument; version: FundraisingFileVersion } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [categorySort, setCategorySort] = useState<"asc" | "desc" | null>(null);
  const historyPanelRef = useRef<HTMLElement>(null);
  const historyCloseRef = useRef<HTMLButtonElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const documentsSorted = useMemo(() => [...documents].sort((a, b) => {
    if (categorySort) {
      const categoryOrder = a.category.localeCompare(b.category) * (categorySort === "asc" ? 1 : -1);
      if (categoryOrder) return categoryOrder;
    }
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  }), [categorySort, documents]);
  const selected = documents.find((doc) => doc.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId) {
      historyCloseRef.current?.focus();
    } else {
      focusReturnRef.current?.focus();
      focusReturnRef.current = null;
    }
  }, [selectedId]);

  const openHistory = (docId: string) => {
    if (!selectedId) focusReturnRef.current = document.activeElement as HTMLElement | null;
    setSelectedId(docId);
    setRenaming(false);
  };
  const closeHistory = () => setSelectedId(null);
  const changeCategory = async (doc: FundraisingDocument, category: FundraisingCategory) => {
    if (category === doc.category) return;
    setActionBusy(doc.id);
    try {
      await updateCategory(doc.id, category);
      toast({ title: "Category updated" });
    } catch (error) {
      toast({ title: "Could not update category", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setActionBusy(null);
    }
  };
  const handleHistoryKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); closeHistory(); return; }
    if (event.key !== "Tab" || !window.matchMedia("(min-width: 1024px)").matches) return;
    const focusables = historyPanelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href], textarea:not([disabled]), select:not([disabled])");
    if (!focusables?.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const openCreate = (category: FundraisingCategory = "Pitch Deck", source: "upload" | "video_link" = "upload") => {
    setFormMode("create"); setFormCategory(category); setSourceMode(source); setFormName(""); setFormUrl(""); setFormNote(""); setFormFile(null); setFormError(null); setProgress(null); setDraftDocument(null); setFormOpen(true);
  };
  const openNewVersion = (source: "upload" | "video_link" = "upload") => {
    if (!selected) return;
    setFormMode("version"); setFormCategory(selected.category); setSourceMode(source); setFormName(selected.display_name); setFormUrl(""); setFormNote(""); setFormFile(null); setFormError(null); setProgress(null); setFormOpen(true);
  };
  const chooseFile = (file: File | null) => {
    setFormFile(file);
    setFormError(null);
    if (file && formMode === "create" && !formName.trim()) {
      setFormName(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
    }
  };
  const submit = async () => {
    setFormError(null);
    if (formMode === "create" && !formName.trim()) { setFormError("Enter a document name."); return; }
    if (sourceMode === "upload" && !formFile) { setFormError("Choose a file to upload."); return; }
    if (sourceMode === "video_link") {
      try { if (formCategory !== "Demo" || new URL(formUrl).protocol !== "https:") throw new Error(); }
      catch { setFormError("Enter a valid HTTPS video URL."); return; }
    }
    setSaving(true);
    try {
      let document = formMode === "create" ? draftDocument : selected;
      if (formMode === "create") {
        document = document ?? await createDocument(formName.trim(), formCategory);
        if (document.display_name !== formName.trim()) {
          await renameDocument(document.id, formName.trim());
          document = { ...document, display_name: formName.trim() };
        }
        setDraftDocument(document);
        setSelectedId(document.id);
      }
      if (!document) throw new Error("Select a document before adding a version.");
      if (sourceMode === "upload") {
        const uploadedFile = formFile!;
        await addUploadVersion(document.id, document.category, uploadedFile, formNote, setProgress);
      } else {
        await addVideoLinkVersion(document.id, formUrl.trim(), formNote);
      }
      await refresh();
      setFormOpen(false);
      setProgress(null);
      toast({ title: formMode === "create" ? "File added" : "Version added", description: `${document.display_name} is up to date.` });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save this version. Please try again.");
    } finally { setSaving(false); }
  };

  const saveRename = async () => {
    if (!selected) return;
    setActionBusy("rename");
    try { await renameDocument(selected.id, renameValue); setRenaming(false); }
    catch (error) { toast({ title: "Rename failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }); }
    finally { setActionBusy(null); }
  };

  const showPreview = async (doc: FundraisingDocument, version: FundraisingFileVersion) => {
    setPreview({ document: doc, version }); setPreviewUrl(null); setPreviewText(null); setPreviewError(null); setPreviewBusy(true);
    try {
      const url = await getPreviewUrl(version);
      if (!url) throw new Error("The private file could not be opened. Your access may have expired; close this preview and try again.");
      setPreviewUrl(url);
      if (version.source_kind === "upload" && ["text/plain", "text/markdown"].includes(version.mime_type ?? mimeFromName(version.original_filename ?? ""))) {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Text preview is unavailable. Download the file to read it.");
        setPreviewText(await response.text());
      }
    } catch (error) { setPreviewError(error instanceof Error ? error.message : "Preview unavailable."); }
    finally { setPreviewBusy(false); }
  };

  const changeCurrent = async (version: FundraisingFileVersion) => {
    if (!selected) return;
    setActionBusy(version.id);
    try { await makeCurrent(selected.id, version.id); }
    catch (error) { toast({ title: "Could not make current", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }); }
    finally { setActionBusy(null); }
  };

  const downloadVersion = async (version: FundraisingFileVersion) => {
    try {
      const url = await getPreviewUrl(version);
      if (!url) throw new Error("A download link is unavailable for this version.");
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = version.original_filename ?? "";
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      anchor.click();
    } catch (error) {
      toast({ title: "Download unavailable", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    }
  };

  return (
    <div className="relative min-h-[520px] w-full min-w-0 max-w-full text-foreground">
      <div className={`min-w-0 transition-[padding] duration-200 ${selected ? "lg:pr-[420px]" : ""}`}>
        <header className="flex flex-wrap items-start justify-between gap-5 pb-9 pt-8">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.035em]">Files</h1>
            <p className="mt-1.5 text-[16px] text-muted-foreground">Your fundraising materials, always up to date.</p>
          </div>
          <Button onClick={() => openCreate()} className="h-9 shrink-0 rounded-lg bg-[#A487F5] px-3 text-xs text-[#17121f] hover:bg-[#9675ef]">
            <Plus className="mr-1.5 size-3.5" />Add file
          </Button>
        </header>

        {loadError && <div role="alert" className="mb-5 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><CircleAlert className="size-4" />{loadError}<Button variant="ghost" size="sm" onClick={() => void refresh()}>Retry</Button></div>}
        <div className="w-full min-w-0">
          <div className="w-full min-w-0">
            <div className="hidden grid-cols-[minmax(0,1.8fr)_minmax(0,.9fr)_minmax(0,.45fr)_minmax(52px,.6fr)_minmax(48px,.55fr)_28px] items-center gap-3 border-b border-border/80 px-3 pb-3 text-[11px] font-medium uppercase tracking-[0.13em] text-muted-foreground md:grid">
              <span className="flex items-center gap-1.5">INTERNAL NAME<TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><button type="button" aria-label="About internal file names" className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"><Info className="size-3.5" /></button></TooltipTrigger><TooltipContent className="max-w-64 text-xs normal-case tracking-normal">Only Vekta users in your company will see this name</TooltipContent></Tooltip></TooltipProvider></span><button type="button" aria-label={`Sort by category${categorySort === "asc" ? ", ascending" : categorySort === "desc" ? ", descending" : ""}`} aria-sort={categorySort === "asc" ? "ascending" : categorySort === "desc" ? "descending" : "none"} onClick={() => setCategorySort((current) => current === "asc" ? "desc" : "asc")} className="flex items-center gap-1 text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Category<ChevronDown className={`size-3.5 transition-transform ${categorySort === "asc" ? "rotate-180" : ""}`} /></button><span>Type</span><span>Version</span><span>Updated</span><span />
            </div>
            {loading ? <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-sm text-muted-foreground"><BouncingDots />Loading files…</div>
              : documentsSorted.length === 0 ? <div className="px-4 py-12 text-sm text-muted-foreground">No fundraising files yet. Add a file to get started.</div>
                : documentsSorted.map((doc) => {
                  const version = currentVersion(doc);
                  const active = doc.id === selectedId;
                  const isDemo = doc.category === "Demo";
                  return <div key={doc.id} className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto_32px] items-center gap-2 border-b border-border/70 px-3 py-4 transition-colors md:grid-cols-[minmax(0,1.8fr)_minmax(0,.9fr)_minmax(0,.45fr)_minmax(52px,.6fr)_minmax(48px,.55fr)_28px] md:gap-3 md:py-5 ${active ? "rounded-md border border-[hsl(var(--success)/.55)] bg-[hsl(var(--success)/.055)] shadow-[inset_3px_0_0_hsl(var(--success))]" : "hover:bg-muted/30"}`}>
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background/70">{isDemo ? version?.source_kind === "video_link" ? <Link2 className="size-[18px]" /> : <Film className="size-[18px]" /> : <FileText className="size-[18px]" />}</div>
                      <div className="min-w-0">
                        <button className="block max-w-full truncate text-left text-[15px] font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => openHistory(doc.id)}>{doc.display_name}</button>
                        <span className="block truncate pt-0.5 text-[13px] text-muted-foreground"><select aria-label={`Change category for ${doc.display_name}`} value={doc.category} disabled={actionBusy === doc.id} onChange={(event) => void changeCategory(doc, event.target.value as FundraisingCategory)} className="mr-1 max-w-[115px] cursor-pointer rounded border border-transparent bg-transparent text-[12px] text-muted-foreground hover:border-border focus:border-input focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 md:hidden">{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select><span className="md:hidden">· </span>{version ? documentSourceLabel(version) : "No version added"}</span>
                      </div>
                    </div>
                    <select aria-label={`Change category for ${doc.display_name}`} value={doc.category} disabled={actionBusy === doc.id} onChange={(event) => void changeCategory(doc, event.target.value as FundraisingCategory)} className="hidden h-8 min-w-0 max-w-full cursor-pointer truncate rounded-md border border-transparent bg-transparent px-1 text-sm text-muted-foreground hover:border-border hover:bg-background/60 focus:border-input focus:bg-background focus:text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 md:block">{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select>
                    <span className="hidden truncate text-sm text-muted-foreground md:block">{fileType(version)}</span>
                    <button onClick={() => openHistory(doc.id)} className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2 py-1.5 text-sm font-medium hover:border-primary/50" aria-label={`Open ${doc.display_name} version history`}><span>v{version?.version_number ?? 0}</span><ChevronDown className="size-3.5" /></button>
                    <span className="hidden truncate text-sm text-muted-foreground md:block">{shortDate(doc.updated_at)}</span>
                    <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`Actions for ${doc.display_name}`} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger><DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openHistory(doc.id)}><Eye className="mr-2 size-4" />Version history</DropdownMenuItem>
                      {version?.source_kind === "upload" && <DropdownMenuItem onClick={() => void downloadVersion(version)}><Download className="mr-2 size-4" />Download current</DropdownMenuItem>}
                      {version?.source_kind === "upload" && version.mime_type === "application/pdf" && onShareDeck && <DropdownMenuItem onClick={() => onShareDeck(version.id)}><Share2 className="mr-2 size-4" />Share deck</DropdownMenuItem>}
                      <DropdownMenuItem onClick={() => { openHistory(doc.id); setRenameValue(doc.display_name); setRenaming(true); }}><Pencil className="mr-2 size-4" />Rename</DropdownMenuItem>
                    </DropdownMenuContent></DropdownMenu>
                  </div>;
                })}
          </div>
        </div>
        {!loading && <p className="pt-5 text-[13px] text-muted-foreground">{documentsSorted.length} {documentsSorted.length === 1 ? "document" : "documents"}</p>}
      </div>

      {selected && <>
        <button aria-label="Close version history" className="fixed inset-0 z-40 bg-black/45 lg:hidden" onClick={closeHistory} />
        <aside ref={historyPanelRef} role="dialog" aria-modal={!window.matchMedia("(min-width: 1024px)").matches} aria-label="Version history" onKeyDown={handleHistoryKeys} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] animate-in slide-in-from-right duration-200 flex-col overflow-y-auto border-l border-border bg-background px-6 pb-8 pt-6 shadow-2xl lg:absolute lg:inset-y-0 lg:right-0 lg:z-10 lg:max-h-full lg:w-[396px] lg:max-w-none lg:shadow-none">
          <div className="mb-7 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Version history</span>
            <button ref={historyCloseRef} aria-label="Close version history" onClick={closeHistory} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-[18px]" /></button>
          </div>
          <div className="mb-5">
            {renaming ? <div className="flex gap-2"><Input autoFocus aria-label="Document name" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveRename(); if (event.key === "Escape") setRenaming(false); }} /><Button size="icon" onClick={() => void saveRename()} disabled={actionBusy === "rename"} aria-label="Save document name"><Check className="size-4" /></Button></div>
              : <div className="flex items-center gap-2"><h2 className="min-w-0 truncate text-[23px] font-semibold tracking-[-0.025em]">{selected.display_name}</h2><button onClick={() => { setRenameValue(selected.display_name); setRenaming(true); }} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Rename document"><Pencil className="size-4" /></button></div>}
            <p className="mt-1.5 text-sm text-muted-foreground">{selected.category}<span className="px-2">·</span>{selected.versions.length} {selected.versions.length === 1 ? "version" : "versions"}</p>
          </div>
          <Button variant="outline" onClick={() => openNewVersion("upload")} className="h-12 w-full border-border text-[15px] font-medium"><Plus className="mr-2 size-4" />Add new version</Button>
          {selected.category === "Demo" && <p className="mt-2 text-center text-[12px] text-muted-foreground">Upload an MP4 or add a video link</p>}

          {selected.versions.length === 0 ? <div className="mt-8 rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No versions yet. Add an upload or video link.</div> :
            <div className="relative mt-7 space-y-0 before:absolute before:bottom-7 before:left-[9px] before:top-3 before:w-px before:bg-border">
              {[...selected.versions].sort((a, b) => b.version_number - a.version_number).map((version) => {
                const isCurrent = selected.current_version_id === version.id;
                const busy = actionBusy === version.id;
                return <article key={version.id} className="relative pb-7 pl-8 last:pb-5">
                  <span className={`absolute left-0 top-1 flex size-[19px] items-center justify-center rounded-full border-2 ${isCurrent ? "border-[hsl(var(--success))] bg-[hsl(var(--success))] shadow-[0_0_12px_hsl(var(--success)/.6)]" : "border-muted-foreground/60 bg-background"}`}>{isCurrent && <span className="size-1.5 rounded-full bg-[hsl(var(--success-foreground))]" />}</span>
                  <div className="flex min-h-6 items-center gap-2"><span className="text-[15px] font-semibold">v{version.version_number}</span>{isCurrent && <span className="rounded-md border border-primary/50 px-2 py-0.5 text-[11px] font-medium text-primary">Current</span>}</div>
                  <div className="mt-1 truncate text-[13px] text-muted-foreground" title={version.source_kind === "video_link" ? version.external_url ?? "" : version.original_filename ?? ""}>{sourceLabel(version)}</div>
                  {version.source_kind === "video_link" && <span className="mt-1 inline-flex rounded-md border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">Video link</span>}
                  {version.change_note && <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{version.change_note}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground"><span>{dateLabel(version.created_at)}</span><span>·</span><span>{version.uploaded_by === selected.user_id ? "You" : version.uploaded_by}</span>{version.size_bytes != null && <><span>·</span><span>{formatSize(version.size_bytes)}</span></>}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" onClick={() => void showPreview(selected, version)} className="h-9 border-border px-3"><Eye className="mr-2 size-4" />Preview</Button>{!isCurrent && <Button variant="ghost" size="sm" onClick={() => void changeCurrent(version)} disabled={busy} className="h-9 text-muted-foreground">{busy && <Loader2 className="mr-2 size-3.5 animate-spin" />}Make current</Button>}</div>
                </article>;
              })}
            </div>}

          {selected.category === "Demo" && <div className="mt-auto border-t border-border pt-5"><p className="mb-3 text-[12px] text-muted-foreground">Demo source</p><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => openNewVersion("upload")} className="h-10"><Upload className="mr-2 size-4" />Upload MP4</Button><Button variant="outline" onClick={() => openNewVersion("video_link")} className="h-10"><Link2 className="mr-2 size-4" />Video link</Button></div></div>}
        </aside>
      </>}

      <Dialog open={formOpen} onOpenChange={(open) => { if (!saving) setFormOpen(open); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[520px]">
          <DialogHeader><DialogTitle>{formMode === "create" ? "Add file" : "Add new version"}</DialogTitle><DialogDescription>{formMode === "create" ? "Create a fundraising document and add its first version." : `Add a version to ${selected?.display_name ?? "this document"}.`}</DialogDescription></DialogHeader>
          <div className="space-y-5 pt-2">
            {formMode === "create" && <>
              <div className="space-y-2"><Label htmlFor="file-name">Document name</Label><Input id="file-name" autoFocus value={formName} onChange={(event) => setFormName(event.target.value)} placeholder="e.g. Pre-Seed Pitch Deck" /></div>
              <div className="space-y-2"><Label htmlFor="file-category">Category</Label><select id="file-category" disabled={Boolean(draftDocument)} value={formCategory} onChange={(event) => { const category = event.target.value as FundraisingCategory; setFormCategory(category); setSourceMode("upload"); setFormFile(null); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div>
            </>}
            {formCategory === "Demo" && <div className="grid grid-cols-2 rounded-lg bg-muted/50 p-1"><button onClick={() => { setSourceMode("upload"); setFormError(null); }} className={`rounded-md px-3 py-2 text-sm ${sourceMode === "upload" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Upload MP4</button><button onClick={() => { setSourceMode("video_link"); setFormError(null); }} className={`rounded-md px-3 py-2 text-sm ${sourceMode === "video_link" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Video link</button></div>}
            {sourceMode === "upload" ? <FileUpload accept={accepted(formCategory)} value={formFile} onChange={chooseFile} onInvalidFile={() => setFormError(formCategory === "Demo" ? "Demo uploads must be MP4 video files." : "Upload a PDF, PPT, or PPTX file.")} onFileTooLarge={() => { chooseFile(null); setFormError("File is over the 25 MB upload limit."); }} maxFileSizeBytes={MAX_UPLOAD_BYTES} description={`${formCategory === "Demo" ? "MP4 video" : "PDF, PPT, or PPTX"} · up to 25 MB`} disabled={saving} /> : <div className="space-y-2"><Label htmlFor="video-url">Video URL</Label><Input id="video-url" type="url" inputMode="url" value={formUrl} onChange={(event) => setFormUrl(event.target.value)} placeholder="https://…" /><p className="text-xs text-muted-foreground">Use a share link from Loom, YouTube, Vimeo, or another HTTPS video page.</p></div>}
            <div className="space-y-2"><Label htmlFor="version-note">Version note <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="version-note" value={formNote} onChange={(event) => setFormNote(event.target.value)} placeholder="What changed in this version?" rows={2} /></div>
            {progress != null && <div className="space-y-2"><div className="flex justify-between text-xs text-muted-foreground"><span>Uploading…</span><span>{progress}%</span></div><Progress value={progress} aria-label={`Upload progress ${progress}%`} /></div>}
            {formError && <p role="alert" className="flex items-start gap-2 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" />{formError}</p>}
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button><Button onClick={() => void submit()} disabled={saving}>{saving && <Loader2 className="mr-2 size-4 animate-spin" />}{saving ? progress != null ? `Uploading ${progress}%` : "Saving…" : formMode === "create" ? "Add file" : "Add version"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={preview !== null} onOpenChange={(open) => { if (!open) { setPreview(null); setPreviewUrl(null); setPreviewText(null); setPreviewError(null); } }}>
        <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-5 py-4 pr-12"><DialogTitle className="truncate text-base">{preview?.document.display_name} · v{preview?.version.version_number}</DialogTitle><DialogDescription className="sr-only">Preview of the selected file version.</DialogDescription></DialogHeader>
          <div className="min-h-[55vh] flex-1 overflow-auto bg-muted/20 p-4">
            {previewBusy ? <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><BouncingDots />Preparing preview…</div>
              : previewError ? <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center"><p className="max-w-md text-sm text-muted-foreground">{previewError}</p>{previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary underline underline-offset-4">Open video</a>}</div>
                : preview?.version.source_kind === "video_link" ? (() => { const embed = previewUrl ? getValidatedVideoEmbedUrl(previewUrl) : null; return embed ? <iframe title={`${preview.document.display_name} version ${preview.version.version_number}`} src={embed} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen className="aspect-video w-full rounded-lg border-0" /> : <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center"><p className="text-sm text-muted-foreground">Preview unavailable for this provider. Open the submitted video link to view it.</p><a href={previewUrl ?? preview.version.external_url!} target="_blank" rel="noreferrer" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Open video</a></div>; })()
                  : previewText != null ? <pre className="mx-auto max-w-3xl whitespace-pre-wrap break-words rounded-lg bg-background p-6 font-sans text-sm leading-6">{previewText}</pre>
                    : preview?.version.mime_type === "application/pdf" && previewUrl ? <iframe title={`${preview.document.display_name} version ${preview.version.version_number}`} src={previewUrl} className="h-[70vh] w-full rounded-lg border border-border bg-background" />
                      : preview?.version.mime_type === "video/mp4" && previewUrl ? <video src={previewUrl} controls playsInline preload="metadata" className="mx-auto max-h-[70vh] w-full rounded-lg" aria-label={`${preview.document.display_name} version ${preview.version.version_number}`} />
                        : <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center"><p className="text-sm text-muted-foreground">Preview unavailable for this format. Download the original file to view it.</p>{previewUrl && <a href={previewUrl} download={preview?.version.original_filename ?? undefined} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Download file</a>}</div>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
