import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabaseAccessToken } from "@/integrations/supabase/client";

type ShowroomLink = {
  id: string;
  name: string;
  recipient_name: string;
  recipient_firm: string | null;
  company_slug: string | null;
  presentation_slug: string | null;
  token: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  has_password?: boolean;
  require_email?: boolean;
  allowed_emails?: string[];
  show_download?: boolean;
  contact_email?: string | null;
  company_stage_snapshot?: string | null;
  intended_investor_id?: string | null;
  company_pitch_decks?: { file_name: string; uploaded_at?: string; slide_count?: number | null } | null;
};

type Feature = { name: string; description: string; status: string };

function FeatureGroup({ title, features }: { title: string; features: Feature[] }) {
  return (
    <section className="rounded-xl border border-border bg-card/30 px-5">
      <h3 className="border-b border-border py-4 text-sm font-semibold">{title}</h3>
      <dl className="divide-y divide-border">
        {features.map((feature) => (
          <div key={feature.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-1 py-4">
            <dt className="text-sm font-medium">{feature.name}</dt>
            <dd className="col-start-1 break-words text-xs leading-relaxed text-muted-foreground">{feature.description}</dd>
            <dd className={`col-start-2 row-span-2 row-start-1 self-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium ${["On", "Active", "Set", "Assigned"].includes(feature.status) ? "border-primary/15 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{feature.status}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ShowroomFeatures({ link }: { link: ShowroomLink }) {
  const onOff = (enabled: unknown) => enabled ? "On" : "Off";
  const expired = Boolean(link.expires_at && Date.parse(link.expires_at) <= Date.now());
  const status = link.revoked_at ? "Revoked" : expired ? "Expired" : "Active";
  const allowedEmails = link.allowed_emails ?? [];
  const emailListEnabled = Boolean(link.require_email && allowedEmails.length);
  const recipient = [link.recipient_name, link.recipient_firm].filter(Boolean).join(", ");

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Current settings for this sharing link. Manage link settings in Share.</p>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <FeatureGroup title="Access and sharing" features={[
            { name: "Link access", status, description: status === "Active" ? "Recipients can open this link, subject to its access requirements." : status === "Revoked" ? "This link has been revoked and is unavailable to recipients." : "This link has expired and is unavailable to recipients." },
            { name: "Password protection", status: onOff(link.has_password), description: link.has_password ? "Recipients must enter the link’s password before viewing." : "No password is required to view this link." },
            { name: "Email requirement", status: onOff(link.require_email), description: link.require_email ? "Recipients must provide an email address before viewing." : "Recipients can view without providing an email address." },
            { name: "Email viewing list", status: onOff(emailListEnabled), description: emailListEnabled ? `Access is limited to: ${allowedEmails.join(", ")}.` : "Access is not restricted to a list of email addresses." },
            { name: "Link expiration", status: onOff(link.expires_at), description: link.expires_at ? `${expired ? "Expired" : "Expires"} ${new Date(link.expires_at).toLocaleString()}.` : "This link has no expiration date." },
            { name: "Custom sharing address", status: onOff(link.company_slug && link.presentation_slug), description: link.company_slug && link.presentation_slug ? `/share/${link.company_slug}/${link.presentation_slug}` : "This link uses its original sharing address." },
          ]} />
          <FeatureGroup title="Link details" features={[
            { name: "Company contact email", status: onOff(link.contact_email), description: link.contact_email || "Contact team directs viewers to Vekta support." },
            { name: "Fundraising round", status: link.company_stage_snapshot ? "Set" : "Not set", description: link.company_stage_snapshot || "No fundraising round is shown on this link." },
            { name: "Assigned investor", status: link.intended_investor_id ? "Assigned" : "Unassigned", description: link.intended_investor_id ? `${recipient || "Investor assigned"}. Used for attribution; this does not restrict access.` : "No investor is assigned to this link." },
          ]} />
        </div>
        <div className="space-y-6">
          <FeatureGroup title="Viewer experience" features={[
            { name: "Downloads", status: onOff(link.show_download), description: link.show_download ? "Recipients can download the shared PDF." : "The download control is disabled." },
            { name: "Printing", status: onOff(link.show_download), description: link.show_download ? "Recipients can print the shared PDF." : "The print control is disabled." },
            { name: "Slide navigation", status: "On", description: "Move between slides with arrows, keyboard shortcuts, or the slide number." },
            { name: "Zoom", status: "On", description: "Zoom in and out of each slide." },
            { name: "Fullscreen", status: "On", description: "Open the deck viewer in fullscreen." },
            { name: "Engagement analytics", status: "On", description: "Track recipient views, slide engagement, and viewing time. Showroom previews are excluded." },
            { name: "Questions & feedback", status: "Not connected", description: "The question form is visible in the viewer. Question delivery is not yet available." },
          ]} />
          {link.company_pitch_decks && (
            <section className="rounded-xl border border-border px-5 py-4">
              <h3 className="text-sm font-semibold">Shared deck</h3>
              <p className="mt-2 break-words text-sm">{link.company_pitch_decks.file_name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{link.company_pitch_decks.slide_count ? `${link.company_pitch_decks.slide_count} slides` : "Slide count not available"}{link.company_pitch_decks.uploaded_at ? ` · Uploaded ${new Date(link.company_pitch_decks.uploaded_at).toLocaleDateString()}` : ""}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function sharePath(link: ShowroomLink): string {
  if (link.company_slug && link.presentation_slug) {
    return `/share/${encodeURIComponent(link.company_slug)}/${encodeURIComponent(link.presentation_slug)}`;
  }
  return link.token ? `/share/${encodeURIComponent(link.token)}` : "";
}

function linkLabel(link: ShowroomLink): string {
  const name = link.name || link.company_pitch_decks?.file_name || "Untitled link";
  const recipient = [link.recipient_name, link.recipient_firm].filter(Boolean).join(", ");
  const status = link.revoked_at ? "Revoked" : link.expires_at && Date.parse(link.expires_at) <= Date.now() ? "Expired" : "";
  return [name, recipient && !name.includes(recipient) ? recipient : "", status].filter(Boolean).join(" · ");
}

export function ShowroomPanel({ onCreateLink }: { onCreateLink?: () => void }) {
  const [links, setLinks] = useState<ShowroomLink[]>([]);
  const [selectedLinkId, setSelectedLinkId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [view, setView] = useState("viewer");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const token = await getSupabaseAccessToken();
        if (controller.signal.aborted) return;
        const response = await fetch("/api/deck-shares", {
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load sharing links.");
        if (controller.signal.aborted) return;
        const nextLinks: ShowroomLink[] = Array.isArray(data.links) ? data.links : [];
        setLinks(nextLinks);
        setSelectedLinkId((current) => nextLinks.some((link) => link.id === current)
          ? current
          : (nextLinks.find((link) => sharePath(link)) ?? nextLinks[0])?.id ?? "");
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Could not load sharing links.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [reload]);

  const selectedLink = links.find((link) => link.id === selectedLinkId);
  const path = selectedLink ? sharePath(selectedLink) : "";

  return (
    <section aria-labelledby="showroom-heading" className="space-y-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="showroom-heading" className="text-2xl font-semibold tracking-[-0.04em]">Showroom</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">See the page each recipient sees when they open your link.</p>
        </div>
        {!loading && !error && links.length > 0 && (
          <div className="w-full space-y-2 sm:max-w-sm">
            <label htmlFor="showroom-link" className="text-xs font-medium text-muted-foreground">Sharing link</label>
            <select id="showroom-link" aria-label="Preview sharing link" value={selectedLinkId} onChange={(event) => setSelectedLinkId(event.target.value)} className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {links.map((link) => {
                const label = linkLabel(link);
                const duplicateLabel = links.some((other) => other.id !== link.id && linkLabel(other) === label);
                return <option key={link.id} value={link.id}>{label}{duplicateLabel ? ` · ${sharePath(link) || link.id}` : ""}</option>;
              })}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div role="status" className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Loading sharing links…</div>
      ) : error ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl border border-border px-6 text-center">
          <p role="alert" className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => setReload((current) => current + 1)}>Try again</Button>
        </div>
      ) : !links.length ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-border px-6 text-center">
          <h3 className="text-base font-medium">No sharing links yet</h3>
          <p className="max-w-sm text-sm text-muted-foreground">Create a link in Share to preview your recipient’s experience here.</p>
          {onCreateLink && <Button variant="outline" onClick={onCreateLink} className="mt-2">Create a sharing link</Button>}
        </div>
      ) : selectedLink ? (
        <Tabs value={view} onValueChange={setView} className="space-y-4">
          <TabsList aria-label="Showroom views">
            <TabsTrigger value="viewer">WHAT VIEWERS SEE</TabsTrigger>
            <TabsTrigger value="features">FEATURES</TabsTrigger>
          </TabsList>
          <TabsContent value="viewer" forceMount hidden={view !== "viewer"} className="mt-0">
            {path ? (
              <div className="overflow-hidden rounded-xl border border-border">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-card px-4 py-3 text-xs text-muted-foreground">
                  <span className="min-w-0 break-all">{path}</span>
                  <span>Previews don’t count toward analytics.</span>
                </div>
                <iframe key={selectedLink.id} title="External viewer preview" src={`${path}?preview=1`} allow="fullscreen" className="h-[75vh] min-h-[34rem] w-full border-0 bg-background" />
              </div>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl border border-border px-6 text-center">
                <p className="text-sm text-muted-foreground">This link has no sharing address. Edit it in Share to assign one.</p>
                {onCreateLink && <Button variant="outline" onClick={onCreateLink}>Go to Share</Button>}
              </div>
            )}
          </TabsContent>
          <TabsContent value="features" className="mt-0"><ShowroomFeatures link={selectedLink} /></TabsContent>
        </Tabs>
      ) : null}
    </section>
  );
}
