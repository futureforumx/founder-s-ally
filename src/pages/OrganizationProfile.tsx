import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, ExternalLink, Globe, MapPin } from "lucide-react";

import { supabasePublicDirectory, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JobsTab } from "@/components/dashboard/founder-detail/JobsTab";

type OrgRow = {
  id: string;
  canonicalName: string;
  description: string | null;
  industry: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  logoUrl: string | null;
  foundedYear: number | null;
  isYcBacked: boolean | null;
  ycBatch: string | null;
  employeeCount: number | null;
};

async function fetchOrganizationById(id: string): Promise<OrgRow | null> {
  const { data, error } = await (supabasePublicDirectory as any)
    .from("organizations")
    .select(
      `
      id,
      "canonicalName",
      description,
      industry,
      city,
      country,
      website,
      "logoUrl",
      "foundedYear",
      "isYcBacked",
      "ycBatch",
      "employeeCount"
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const o = data as Record<string, unknown>;
  return {
    id: String(o.id),
    canonicalName: String(o.canonicalName ?? ""),
    description: typeof o.description === "string" ? o.description : null,
    industry: typeof o.industry === "string" ? o.industry : null,
    city: typeof o.city === "string" ? o.city : null,
    country: typeof o.country === "string" ? o.country : null,
    website: typeof o.website === "string" ? o.website : null,
    logoUrl: typeof o.logoUrl === "string" ? o.logoUrl : null,
    foundedYear: typeof o.foundedYear === "number" ? o.foundedYear : null,
    isYcBacked: typeof o.isYcBacked === "boolean" ? o.isYcBacked : null,
    ycBatch: typeof o.ycBatch === "string" ? o.ycBatch : null,
    employeeCount: typeof o.employeeCount === "number" ? o.employeeCount : null,
  };
}

export default function OrganizationProfile() {
  const { id } = useParams<{ id: string }>();

  const query = useQuery({
    queryKey: ["organization-profile", id],
    queryFn: () => fetchOrganizationById(id!),
    enabled: Boolean(id && isSupabaseConfigured),
  });

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-10">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle>Directory unavailable</CardTitle>
            <CardDescription>
              Configure the Supabase project that hosts the <code className="text-xs">organizations</code> table to view company profiles here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/">Back to app</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!id) {
    return (
      <div className="min-h-screen bg-background p-6">
        <p className="text-sm text-muted-foreground">Missing company id.</p>
        <Button asChild variant="link" className="mt-2 px-0">
          <Link to="/">Back to app</Link>
        </Button>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">
        Loading company…
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-10">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle>Company not found</CardTitle>
            <CardDescription>
              This id is not in the organizations directory, or the row is not published for live display.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/">Back to app</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const org = query.data;
  const location = [org.city, org.country].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/60 bg-card/40">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="shrink-0 gap-1.5 -ml-2">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              App
            </Link>
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl border border-border/60 bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
            {org.logoUrl ? (
              <img src={org.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-7 w-7 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{org.canonicalName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {org.industry ? <span>{org.industry}</span> : null}
              {org.ycBatch ? <span className="tabular-nums">YC {org.ycBatch}</span> : null}
              {org.foundedYear ? <span className="tabular-nums">Founded {org.foundedYear}</span> : null}
              {org.employeeCount != null ? <span className="tabular-nums">{org.employeeCount} employees</span> : null}
            </div>
            {location ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {location}
              </p>
            ) : null}
            {org.website ? (
              <a
                href={org.website.startsWith("http") ? org.website : `https://${org.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Globe className="h-3.5 w-3.5" />
                Website
                <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
              </a>
            ) : null}
          </div>
        </div>

        {org.description ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">About</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{org.description}</p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Open roles</CardTitle>
            <CardDescription>Synced from our directory job index (not live-scraped in the browser).</CardDescription>
          </CardHeader>
          <CardContent>
            <JobsTab organizationId={org.id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
