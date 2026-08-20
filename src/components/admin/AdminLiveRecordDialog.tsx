import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAppAdmin } from "@/hooks/useAppAdmin";
import { useUserCredits } from "@/hooks/useContactReveal";
import {
  adminLiveRecordLabel,
  fetchAdminLiveRecord,
  patchAdminLiveRecord,
  type AdminLiveRecordTarget,
} from "@/lib/adminLiveRecord";
import {
  formatAdminLiveFieldDisplay,
  getAdminLiveFieldSpec,
  parseAdminLiveFieldValue,
  recommendAdminLiveField,
} from "@/lib/adminLiveFieldOptions";
import { AdminEditButton } from "./AdminEditButton";
import { AdminLiveFieldCombobox } from "./AdminLiveFieldCombobox";

const READONLY_KEYS = new Set([
  "id",
  "created_at",
  "createdAt",
  "updated_at",
  "updatedAt",
  "deleted_at",
]);

const PRIORITY_KEYS = [
  "firm_name",
  "canonicalName",
  "full_name",
  "first_name",
  "last_name",
  "firstName",
  "lastName",
  "title",
  "legal_name",
  "tagline",
  "elevator_pitch",
  "description",
  "bio",
  "short_summary",
  "location",
  "city",
  "state",
  "country",
  "hq_city",
  "hq_state",
  "hq_country",
  "hq_zip_code",
  "website_url",
  "website",
  "logo_url",
  "logoUrl",
  "avatar_url",
  "avatarUrl",
  "favicon_url",
  "email",
  "phone",
  "linkedin_url",
  "linkedinUrl",
  "x_url",
  "twitterUrl",
  "firm_type",
  "entity_type",
  "sector_classification",
  "stage_classification",
  "theme_classification",
  "structure_classification",
  "thesis_orientation",
  "sector_scope",
  "reputation_score",
  "responsiveness_score",
  "founder_reputation_score",
  "aum",
  "aum_usd",
  "preferred_stage",
  "stage_focus",
  "thesis_verticals",
  "sector_focus",
  "industry",
  "stage",
  "is_actively_deploying",
  "is_available",
  "ready_for_live",
  "needs_review",
];

function isSkippedKey(key: string): boolean {
  if (READONLY_KEYS.has(key)) return true;
  if (/embedding$/i.test(key)) return true;
  return false;
}

function isLongTextKey(key: string): boolean {
  return /bio|description|summary|pitch|thesis|notes|detail/i.test(key);
}

function stringifyEditorValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseEditorValue(original: unknown, raw: string): unknown {
  const trimmed = raw.trim();
  if (original == null) {
    if (!trimmed) return null;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (typeof original === "boolean") {
    if (trimmed === "") return null;
    return trimmed === "true" || trimmed === "1";
  }
  if (typeof original === "number") {
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : original;
  }
  if (Array.isArray(original)) {
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    } catch {
      return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  if (typeof original === "object") {
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return original;
    }
  }
  return trimmed.length > 0 ? trimmed : null;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function JsonAwareTextField({
  id,
  label,
  hint,
  original,
  onChange,
}: {
  id: string;
  label: string;
  hint: string | null;
  original: unknown;
  onChange: (next: unknown) => void;
}) {
  const [text, setText] = useState(() => stringifyEditorValue(original));

  useEffect(() => {
    setText(stringifyEditorValue(original));
  }, [original]);

  const commit = (next: string) => {
    onChange(parseEditorValue(original, next));
  };

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-[11px] font-medium capitalize text-muted-foreground">
        {label}
        {hint}
      </Label>
      <Textarea
        id={id}
        value={text}
        rows={Math.min(8, Math.max(3, text.split("\n").length + 1))}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (typeof original === "string" || original == null) commit(next);
        }}
        onBlur={() => commit(text)}
      />
    </div>
  );
}

function FieldEditor({
  fieldKey,
  value,
  record,
  onChange,
}: {
  fieldKey: string;
  value: unknown;
  record: Record<string, unknown>;
  onChange: (next: unknown) => void;
}) {
  const id = `admin-live-${fieldKey}`;
  const label = fieldKey.replace(/_/g, " ");
  const spec = getAdminLiveFieldSpec(fieldKey);
  const recommendation = spec ? recommendAdminLiveField(fieldKey, record) : null;
  const suggestion =
    recommendation && String(value ?? "") !== recommendation.value ? recommendation : null;

  if (spec) {
    return (
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={id} className="text-[11px] font-medium capitalize text-muted-foreground">
            {label}
          </Label>
          {suggestion ? (
            <button
              type="button"
              onClick={() => {
                const parsed = parseAdminLiveFieldValue(fieldKey, suggestion.value);
                if (parsed.ok) onChange(parsed.value);
              }}
              className="inline-flex max-w-[60%] items-center gap-1 truncate text-[10px] font-medium text-primary hover:underline"
            >
              <Sparkles className="h-3 w-3 shrink-0" />
              <span className="truncate">
                Use {formatAdminLiveFieldDisplay(fieldKey, suggestion.value)}
              </span>
            </button>
          ) : null}
        </div>
        <AdminLiveFieldCombobox
          id={id}
          fieldKey={fieldKey}
          spec={spec}
          value={value}
          recommendation={recommendation}
          onChange={onChange}
        />
      </div>
    );
  }

  if (typeof value === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2">
        <Label htmlFor={id} className="text-[11px] font-medium capitalize text-muted-foreground">
          {label}
        </Label>
        <Switch id={id} checked={value} onCheckedChange={onChange} />
      </div>
    );
  }

  if (typeof value === "number") {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id} className="text-[11px] font-medium capitalize text-muted-foreground">
          {label}
        </Label>
        <Input
          id={id}
          type="number"
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next === "" ? null : Number(next));
          }}
        />
      </div>
    );
  }

  const isJsonObject =
    (value != null && typeof value === "object" && !Array.isArray(value)) ||
    (Array.isArray(value) && value.some((item) => item != null && typeof item === "object"));
  const text = stringifyEditorValue(value);
  const useTextarea =
    isLongTextKey(fieldKey) ||
    text.includes("\n") ||
    text.length > 120 ||
    Array.isArray(value) ||
    isJsonObject;

  if (useTextarea) {
    return (
      <JsonAwareTextField
        id={id}
        label={label}
        hint={Array.isArray(value) && !isJsonObject ? " (comma or JSON)" : isJsonObject ? " (JSON)" : null}
        original={value}
        onChange={onChange}
      />
    );
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-[11px] font-medium capitalize text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        value={text}
        onChange={(e) => onChange(parseEditorValue(value, e.target.value))}
      />
    </div>
  );
}

export function AdminLiveRecordDialog({
  target,
  open,
  onOpenChange,
  onSaved,
}: {
  target: AdminLiveRecordTarget | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSaved?: () => void | Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [original, setOriginal] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open || !target) {
      setOriginal(null);
      setDraft(null);
      setError(null);
      setQuery("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAdminLiveRecord(target.entity, target.id)
      .then(({ row, error: loadError }) => {
        if (cancelled) return;
        if (loadError || !row) {
          setError(loadError ?? "Record not found.");
          setOriginal(null);
          setDraft(null);
          return;
        }
        setOriginal(row);
        setDraft(row);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, target?.entity, target?.id]);

  const fieldKeys = useMemo(() => {
    if (!draft) return [];
    const keys = Object.keys(draft).filter((k) => !isSkippedKey(k));
    const priority = new Map(PRIORITY_KEYS.map((k, i) => [k, i]));
    keys.sort((a, b) => {
      const pa = priority.has(a) ? priority.get(a)! : 1000;
      const pb = priority.has(b) ? priority.get(b)! : 1000;
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });
    const q = query.trim().toLowerCase();
    if (!q) return keys;
    return keys.filter((k) => k.toLowerCase().includes(q) || stringifyEditorValue(draft[k]).toLowerCase().includes(q));
  }, [draft, query]);

  async function handleSave() {
    if (!target || !original || !draft) return;
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(draft)) {
      if (isSkippedKey(key)) continue;
      if (!valuesEqual(original[key], draft[key])) patch[key] = draft[key];
    }
    if (!Object.keys(patch).length) {
      toast.message("No changes to save.");
      return;
    }
    setSaving(true);
    try {
      const { error: saveError } = await patchAdminLiveRecord(target.entity, target.id, patch);
      if (saveError) {
        toast.error(saveError);
        return;
      }
      toast.success(`${adminLiveRecordLabel(target.entity)} record updated.`);
      await onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, saving, onOpenChange]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200]" role="presentation">
      <button
        type="button"
        aria-label="Close editor"
        className="absolute inset-0 bg-black/70"
        onClick={() => {
          if (!saving) onOpenChange(false);
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-live-record-title"
        className="absolute inset-y-0 right-0 flex h-dvh w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="min-w-0 pr-6">
            <p id="admin-live-record-title" className="text-sm font-semibold text-foreground">
              Edit {target ? adminLiveRecordLabel(target.entity) : "Record"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {target?.title ? `${target.title} — ` : ""}
              changes apply immediately to the live directory record.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative shrink-0 border-b border-border/40 px-5 py-3">
          <Search className="pointer-events-none absolute left-7 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter fields…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{error}</p>
          ) : draft ? (
            <div className="grid gap-3 pb-2">
              {fieldKeys.map((key) => (
                <FieldEditor
                  key={key}
                  fieldKey={key}
                  value={draft[key]}
                  record={draft}
                  onChange={(next) => setDraft((prev) => (prev ? { ...prev, [key]: next } : prev))}
                />
              ))}
              {fieldKeys.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No matching fields.</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || Boolean(error)}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

export function AdminLiveRecordControl({
  target,
  onSaved,
  className,
}: {
  target: AdminLiveRecordTarget | null;
  onSaved?: () => void | Promise<void>;
  className?: string;
}) {
  const { isAppAdmin, loading: adminLoading } = useAppAdmin();
  const { data: userCredits } = useUserCredits();
  const [open, setOpen] = useState(false);
  const handleOpen = useCallback(() => setOpen(true), []);
  const canEdit = isAppAdmin || userCredits?.tier === "admin";

  if (adminLoading || !canEdit || !target) return null;

  return (
    <>
      <AdminEditButton
        onClick={handleOpen}
        className={className}
        label={`Edit ${adminLiveRecordLabel(target.entity).toLowerCase()} record`}
      />
      <AdminLiveRecordDialog
        target={open ? target : null}
        open={open}
        onOpenChange={setOpen}
        onSaved={onSaved}
      />
    </>
  );
}
