import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Plus, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type MemberType = "founder" | "operator";
type Source = "company" | "founder" | "operator";

interface TeamMember {
  id: string;
  full_name: string;
  title: string;
  member_type: MemberType;
  ready_for_live: boolean;
}

interface Suggestion extends TeamMember {
  source: Source;
}

const db = supabase as any;

function inferMemberType(title: string): MemberType {
  return /\bfounder\b/i.test(title) ? "founder" : "operator";
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function CompanyTeamMembersField() {
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [companySuggestions, setCompanySuggestions] = useState<Suggestion[]>([]);
  const [directorySuggestions, setDirectorySuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const loadTeam = useCallback(async () => {
    if (!user?.id) {
      setCompanyId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [{ data: profile }, { data: membership }, { data: ownedCompany }] = await Promise.all([
        db.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle(),
        db.from("company_members").select("company_id").eq("user_id", user.id).in("role", ["owner", "manager", "admin"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("company_analyses").select("id, company_name").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      let resolvedCompanyId = typeof profile?.company_id === "string" ? profile.company_id : null;
      let resolvedCompanyName = "";
      if (resolvedCompanyId) {
        const { data: company } = await db.from("company_analyses").select("company_name").eq("id", resolvedCompanyId).maybeSingle();
        resolvedCompanyName = company?.company_name ?? "";
      }
      if (!resolvedCompanyId && typeof membership?.company_id === "string") resolvedCompanyId = membership.company_id;
      if (!resolvedCompanyId && typeof ownedCompany?.id === "string") {
        resolvedCompanyId = ownedCompany.id;
        resolvedCompanyName = ownedCompany.company_name ?? "";
      }

      setCompanyId(resolvedCompanyId);
      setCompanyName(resolvedCompanyName);
      if (!resolvedCompanyId) {
        setTeam([]);
        setCompanySuggestions([]);
        setDirectorySuggestions([]);
        return;
      }

      const [{ data: savedMembers, error: teamError }, { data: companyProfiles }, { data: roles }, { data: operators }] = await Promise.all([
        db.from("company_team_members").select("id, full_name, title, member_type, ready_for_live").eq("company_id", resolvedCompanyId).order("created_at", { ascending: true }),
        db.from("profiles").select("id, full_name, title, user_type").eq("company_id", resolvedCompanyId).neq("user_id", user.id).limit(30),
        db.from("roles").select('"personId", title, "roleType", person:people!inner(id, "canonicalName", ready_for_live)').in("roleType", ["founder", "cofounder", "ceo"]).eq("isCurrent", true).limit(60),
        db.from("operator_profiles").select("id, full_name, title").is("deleted_at", null).eq("is_available", true).eq("ready_for_live", true).limit(40),
      ]);

      if (teamError) console.warn("[CompanyTeamMembersField] company roster:", teamError.message);
      const saved = (savedMembers ?? []) as TeamMember[];
      const profiles = (companyProfiles ?? []) as Array<{ id: string; full_name: string; title: string | null; user_type: string | null }>;
      setTeam(saved);

      const companyRows: Suggestion[] = [
        ...saved.map((row) => ({ ...row, source: "company" as const })),
        ...profiles.filter((row) => row.full_name?.trim()).map((row) => ({
          id: `profile-${row.id}`,
          full_name: row.full_name,
          title: row.title?.trim() || (row.user_type === "operator" ? "Operator" : "Founder"),
          member_type: inferMemberType(row.title ?? ""),
          ready_for_live: true,
          source: "company" as const,
        })),
      ];
      const companySeen = new Set<string>();
      const uniqueCompanyRows = companyRows.filter((row) => {
        const key = row.full_name.trim().toLowerCase();
        if (companySeen.has(key)) return false;
        companySeen.add(key);
        return true;
      });
      setCompanySuggestions(uniqueCompanyRows);

      const founderRows: Suggestion[] = (roles ?? []).flatMap((row: any) => {
        const person = Array.isArray(row.person) ? row.person[0] : row.person;
        const fullName = typeof person?.canonicalName === "string" ? person.canonicalName.trim() : "";
        if (!fullName || person?.ready_for_live !== true) return [];
        return [{ id: `directory-founder-${person.id}`, full_name: fullName, title: row.title?.trim() || "Founder", member_type: "founder", ready_for_live: true, source: "founder" }];
      });
      const operatorRows: Suggestion[] = (operators ?? []).flatMap((row: any) => {
        const fullName = typeof row.full_name === "string" ? row.full_name.trim() : "";
        if (!fullName) return [];
        return [{ id: `directory-operator-${row.id}`, full_name: fullName, title: row.title?.trim() || "Operator", member_type: "operator", ready_for_live: true, source: "operator" }];
      });
      const directorySeen = new Set<string>();
      setDirectorySuggestions([...founderRows, ...operatorRows].filter((row) => {
        const key = row.full_name.toLowerCase();
        if (directorySeen.has(key)) return false;
        directorySeen.add(key);
        return true;
      }).slice(0, 16));
    } catch (error) {
      console.warn("[CompanyTeamMembersField] load failed:", error);
      setTeam([]);
      setCompanySuggestions([]);
      setDirectorySuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void loadTeam(); }, [loadTeam]);

  const suggestions = companySuggestions.length ? companySuggestions : directorySuggestions;
  const suggestionLabel = companySuggestions.length ? "Suggested from your company" : "Live founders and operators";
  const alreadyAdded = useMemo(() => {
    const normalizedName = normalizeName(name).toLowerCase();
    return team.some((row) => row.full_name.trim().toLowerCase() === normalizedName)
      || companySuggestions.some((row) => row.full_name.trim().toLowerCase() === normalizedName);
  }, [companySuggestions, name, team]);

  const chooseSuggestion = (suggestion: Suggestion) => {
    setName(suggestion.full_name);
    setTitle(suggestion.title);
    setShowSuggestions(false);
  };

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fullName = normalizeName(name);
    const cleanTitle = normalizeName(title);
    if (!companyId || !user?.id || !fullName || !cleanTitle || alreadyAdded) return;

    setSaving(true);
    const { data, error } = await db.from("company_team_members").insert({
      company_id: companyId,
      full_name: fullName,
      title: cleanTitle,
      created_by: user.id,
    }).select("id, full_name, title, member_type, ready_for_live").single();
    setSaving(false);

    if (error) {
      if (error.code === "23505") {
        await loadTeam();
        toast({ title: "Already on the team", description: `${fullName} is already listed for this company.` });
      } else {
        toast({ title: "Couldn't add team member", description: error.message, variant: "destructive" });
      }
      return;
    }

    setTeam((current) => [...current, data as TeamMember]);
    setName("");
    setTitle("");
    toast({ title: "Team member added", description: `${fullName} is linked to ${companyName || "your company"}.` });
  };

  const memberType = inferMemberType(title);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-emerald-400"><Users className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h4 className="font-sans text-sm font-semibold text-neutral-100">Team Members</h4>
          <p className="mt-1 font-sans text-xs text-neutral-500">Add founders and operators to your company team.</p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />}
      </div>

      {team.length > 0 && <div className="mt-4 flex flex-wrap gap-2" aria-label="Current team members">
        {team.map((member) => <span key={member.id} className="rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-sans text-xs text-neutral-300"><span className="font-medium text-neutral-100">{member.full_name}</span><span className="text-neutral-500"> · {member.title}</span><span className={cn("ml-2 capitalize", member.member_type === "founder" ? "text-emerald-400" : "text-sky-400")}>{member.member_type}</span>{!member.ready_for_live && <span className="ml-2 text-neutral-600">Pending live criteria</span>}</span>)}
      </div>}

      <form onSubmit={addMember} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div className="relative">
          <label htmlFor="company-team-name" className="mb-1.5 block font-sans text-xs font-medium text-neutral-300">Team Member</label>
          <input id="company-team-name" value={name} onChange={(event) => { setName(event.target.value); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)} autoComplete="off" placeholder="Search or enter a name" className="h-10 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 font-sans text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-emerald-700" />
          {showSuggestions && suggestions.length > 0 && <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950 p-1 shadow-xl">
            <p className="px-2 py-1.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{suggestionLabel}</p>
            {suggestions.filter((suggestion) => !name.trim() || suggestion.full_name.toLowerCase().includes(name.trim().toLowerCase())).slice(0, 8).map((suggestion) => (
              <button key={suggestion.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSuggestion(suggestion)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-neutral-900">
                <span className="min-w-0"><span className="block truncate font-sans text-xs text-neutral-100">{suggestion.full_name}</span><span className="block truncate font-sans text-[10px] text-neutral-500">{suggestion.title}</span></span>
                <span className={cn("shrink-0 font-sans text-[9px] uppercase", suggestion.member_type === "founder" ? "text-emerald-400" : "text-sky-400")}>{suggestion.member_type}</span>
              </button>
            ))}
          </div>}
        </div>
        <div>
          <label htmlFor="company-team-title" className="mb-1.5 block font-sans text-xs font-medium text-neutral-300">Title</label>
          <input id="company-team-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Co-Founder & CTO" className="h-10 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 font-sans text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-emerald-700" />
        </div>
        <div className="flex items-end gap-2">
          <div>
            <span className="mb-1.5 block font-sans text-xs font-medium text-neutral-300">TYPE</span>
            <span className={cn("inline-flex h-10 items-center rounded-lg border border-neutral-800 bg-neutral-950 px-3 font-sans text-xs capitalize", memberType === "founder" ? "text-emerald-400" : "text-sky-400")}>{memberType}</span>
          </div>
          <button type="submit" disabled={saving || loading || !companyId || !normalizeName(name) || !normalizeName(title) || alreadyAdded} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 font-sans text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}{alreadyAdded ? "Added" : "Add"}
          </button>
        </div>
      </form>
      {!loading && !companyId && <p className="mt-2 font-sans text-xs text-amber-400">Link a company to your account before adding team members.</p>}
      {!loading && companyId && !suggestions.length && <p className="mt-2 font-sans text-[11px] text-neutral-600">No saved teammates or live directory suggestions yet. You can enter a name and title manually.</p>}
    </div>
  );
}
