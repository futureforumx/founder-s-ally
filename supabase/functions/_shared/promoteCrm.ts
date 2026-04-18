// =============================================================================
// promoteCrm.ts
// =============================================================================
// Promotes staged CRM records into the graph layer:
//
//   contact  → resolves / creates a people row, back-fills crm_contacts.person_id
//   company  → resolves / creates an organizations row, back-fills crm_companies.organization_id
//   activity → upserts an interactions row (kind = 'crm_touch'), calls upsertEdge
//
// All three steps are idempotent and independent.
//
// Tables read:    crm_contacts, crm_companies, crm_activities (passed in via StageCrmResult)
// Tables written: interactions, interaction_participants,
//                 crm_contacts (person_id), crm_companies (organization_id),
//                 relationship_edges, relationship_contexts
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type {
  ConnectorSourceRecord,
  CrmContact,
  CrmCompany,
  CrmActivity,
  StageCrmResult,
  Interaction,
  PromoteCrmResult,
} from "./connector-types.ts";
import { ensurePersonByEmail, ensureOrganizationByDomain } from "./resolveIdentity.ts";
import { upsertEdge } from "./upsertEdge.ts";

// ---------------------------------------------------------------------------
// promoteCrm
// ---------------------------------------------------------------------------

export async function promoteCrm(
  supabase: SupabaseClient,
  sourceRecord: ConnectorSourceRecord,
  staged: StageCrmResult,
  selfPersonId: string | null,
): Promise<PromoteCrmResult> {
  // --- Contact: resolve person and back-fill ---
  let contactPersonId: string | null = null;

  if (staged.contact) {
    contactPersonId = await promoteContact(supabase, staged.contact);
  }

  // --- Company: resolve org and back-fill ---
  if (staged.company) {
    await promoteCompany(supabase, staged.company);
  }

  // --- Activity: create interaction + edge ---
  let interaction: Interaction | null = null;
  let alreadyExisted = false;

  if (staged.activity) {
    const result = await promoteActivity(
      supabase,
      sourceRecord,
      staged.activity,
      selfPersonId,
      contactPersonId,
    );
    interaction   = result.interaction;
    alreadyExisted = result.alreadyExisted;
  }

  return { interaction, alreadyExisted };
}

// ---------------------------------------------------------------------------
// promoteContact
// ---------------------------------------------------------------------------

async function promoteContact(
  supabase: SupabaseClient,
  contact: CrmContact,
): Promise<string | null> {
  // Already resolved
  if (contact.person_id) return contact.person_id;

  // Need an email to resolve a person
  if (!contact.email) return null;

  const displayName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null;
  const person = await ensurePersonByEmail(supabase, contact.email, displayName);

  // Back-fill crm_contacts.person_id
  await supabase
    .from("crm_contacts")
    .update({ person_id: person.id })
    .eq("id", contact.id);

  return person.id;
}

// ---------------------------------------------------------------------------
// promoteCompany
// ---------------------------------------------------------------------------

async function promoteCompany(
  supabase: SupabaseClient,
  company: CrmCompany,
): Promise<void> {
  // Already resolved
  if (company.organization_id) return;

  if (!company.domain) return;

  const org = await ensureOrganizationByDomain(supabase, company.domain, company.name);

  // Back-fill crm_companies.organization_id
  await supabase
    .from("crm_companies")
    .update({ organization_id: org.id })
    .eq("id", company.id);
}

// ---------------------------------------------------------------------------
// promoteActivity
// ---------------------------------------------------------------------------

async function promoteActivity(
  supabase: SupabaseClient,
  sourceRecord: ConnectorSourceRecord,
  activity: CrmActivity,
  selfPersonId: string | null,
  contactPersonId: string | null,
): Promise<{ interaction: Interaction; alreadyExisted: boolean }> {
  let interaction: Interaction;
  let alreadyExisted = false;

  const interactionRow = {
    owner_context_id: sourceRecord.owner_context_id,
    source_record_id: sourceRecord.id,
    kind:             "crm_touch" as const,
    external_id:      activity.external_id ?? null,
    title:            activity.title ?? null,
    body_text:        activity.body ?? null,
    occurred_at:      activity.occurred_at ?? null,
    metadata:         { activity_type: activity.activity_type },
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("interactions")
    .insert(interactionRow)
    .select()
    .single();

  if (!insertErr) {
    interaction = inserted as Interaction;
  } else if ((insertErr as { code?: string }).code === "23505") {
    alreadyExisted = true;

    // Only fetch by external_id if we have one; otherwise fall back to the
    // first matching crm_touch for this source_record_id.
    let fetchQuery = supabase
      .from("interactions")
      .select()
      .eq("owner_context_id", sourceRecord.owner_context_id)
      .eq("kind", "crm_touch");

    if (activity.external_id) {
      fetchQuery = fetchQuery.eq("external_id", activity.external_id);
    } else {
      fetchQuery = fetchQuery.eq("source_record_id", sourceRecord.id);
    }

    const { data: existing, error: fetchErr } = await fetchQuery.single();

    if (fetchErr || !existing) {
      throw new Error(
        `promoteCrm: interaction fetch-after-conflict failed: ${fetchErr?.message ?? "no row"}`,
      );
    }
    interaction = existing as Interaction;
  } else {
    throw new Error(`promoteCrm: interaction insert failed: ${insertErr.message}`);
  }

  // --- Upsert interaction_participant for the contact (if resolved) ---
  if (contactPersonId) {
    const contactRow = {
      interaction_id:   interaction.id,
      owner_context_id: sourceRecord.owner_context_id,
      person_id:        contactPersonId,
      role:             "contact",
      is_self:          false,
    };

    const { error: ipErr } = await supabase
      .from("interaction_participants")
      .insert(contactRow)
      .select("id");

    if (ipErr && (ipErr as { code?: string }).code !== "23505") {
      throw new Error(`promoteCrm: interaction_participants insert failed: ${ipErr.message}`);
    }
  }

  // --- Edge: (self ↔ contact) ---
  if (selfPersonId && contactPersonId && selfPersonId !== contactPersonId) {
    await upsertEdge(supabase, {
      ownerContextId: sourceRecord.owner_context_id,
      selfPersonId,
      otherPersonId: contactPersonId,
      kind:          "crm_touch",
      occurredAt:    activity.occurred_at ?? null,
    });
  }

  return { interaction, alreadyExisted };
}
