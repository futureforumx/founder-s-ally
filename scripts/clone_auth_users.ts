#!/usr/bin/env tsx
/**
 * clone_auth_users.ts
 *
 * Migrates Supabase Auth users from a source project to a destination project
 * using the GoTrue Admin API.
 *
 * Required environment variables:
 *   SRC_SUPABASE_URL              – Source project URL
 *   SRC_SUPABASE_SERVICE_ROLE_KEY – Source service role key
 *   DST_SUPABASE_URL              – Destination project URL
 *   DST_SUPABASE_SERVICE_ROLE_KEY – Destination service role key
 *
 * Optional:
 *   DRY_RUN=true  – Print actions without making changes
 *   PAGE_SIZE     – Users per page (default 1000, max 1000)
 *
 * Outputs: migrated_users.json
 *
 * ⚠️  Limitations
 * ──────────────
 * • Raw password hashes are NOT copied. Each migrated user is created with a
 *   cryptographically-random temporary password. Users MUST reset their
 *   password on first login (send a password-reset email after migration).
 * • OAuth identities cannot be recreated via the Admin API; users who only
 *   signed in via Google/GitHub/etc. will need to re-link their provider.
 * • `created_at` is set by the server and cannot be overridden.
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

// ── Config ───────────────────────────────────────────────────────────────────

const DRY_RUN = process.env.DRY_RUN === "true";
const PAGE_SIZE = Math.min(parseInt(process.env.PAGE_SIZE ?? "1000", 10), 1000);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const SRC_URL = requireEnv("SRC_SUPABASE_URL");
const SRC_KEY = requireEnv("SRC_SUPABASE_SERVICE_ROLE_KEY");
const DST_URL = requireEnv("DST_SUPABASE_URL");
const DST_KEY = requireEnv("DST_SUPABASE_SERVICE_ROLE_KEY");

// ── Clients ──────────────────────────────────────────────────────────────────

const srcClient = createClient(SRC_URL, SRC_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const dstClient = createClient(DST_URL, DST_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Types ────────────────────────────────────────────────────────────────────

interface UserReport {
  source_id: string;
  email: string | undefined;
  status: "created" | "existing" | "failed";
  destination_id?: string;
  error?: string;
}

interface Report {
  dry_run: boolean;
  timestamp: string;
  total_source: number;
  created: number;
  existing: number;
  failed: number;
  users: UserReport[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateTempPassword(): string {
  return randomBytes(24).toString("base64url");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== Supabase Auth User Migration ===`);
  console.log(`Source:      ${SRC_URL}`);
  console.log(`Destination: ${DST_URL}`);
  console.log(`Dry run:     ${DRY_RUN}`);
  console.log(`Page size:   ${PAGE_SIZE}`);
  console.log("");

  const report: Report = {
    dry_run: DRY_RUN,
    timestamp: new Date().toISOString(),
    total_source: 0,
    created: 0,
    existing: 0,
    failed: 0,
    users: [],
  };

  // ── Collect all users from source (paginated) ─────────────────────────────

  console.log("Fetching users from source project…");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sourceUsers: any[] = [];

  let page = 1;
  while (true) {
    const { data, error } = await srcClient.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });

    if (error) {
      console.error(`ERROR: Failed to list users from source (page ${page}):`, error.message);
      process.exit(1);
    }

    sourceUsers.push(...data.users);
    console.log(`  Fetched page ${page}: ${data.users.length} users (total so far: ${sourceUsers.length})`);

    if (data.users.length < PAGE_SIZE) break;
    page++;
  }

  report.total_source = sourceUsers.length;
  console.log(`\nTotal source users: ${sourceUsers.length}\n`);

  if (sourceUsers.length === 0) {
    console.log("No users to migrate.");
    writeReport(report);
    return;
  }

  // ── Fetch existing emails in destination (for idempotency) ───────────────

  console.log("Fetching existing users from destination (for deduplication)…");
  const existingEmails = new Set<string>();

  let dstPage = 1;
  while (true) {
    const { data, error } = await dstClient.auth.admin.listUsers({
      page: dstPage,
      perPage: PAGE_SIZE,
    });

    if (error) {
      console.error(`ERROR: Failed to list destination users:`, error.message);
      process.exit(1);
    }

    for (const u of data.users) {
      if (u.email) existingEmails.add(u.email.toLowerCase());
    }

    if (data.users.length < PAGE_SIZE) break;
    dstPage++;
  }

  console.log(`Existing destination users: ${existingEmails.size}\n`);

  // ── Migrate each user ─────────────────────────────────────────────────────

  for (let i = 0; i < sourceUsers.length; i++) {
    const user = sourceUsers[i];
    const email = user.email?.toLowerCase();

    process.stdout.write(
      `[${i + 1}/${sourceUsers.length}] ${email ?? user.id} … `
    );

    // Skip if already present
    if (email && existingEmails.has(email)) {
      console.log("SKIP (already exists)");
      report.existing++;
      report.users.push({
        source_id: user.id,
        email: user.email,
        status: "existing",
      });
      continue;
    }

    if (DRY_RUN) {
      console.log("DRY_RUN (would create)");
      report.created++;
      report.users.push({
        source_id: user.id,
        email: user.email,
        status: "created",
      });
      continue;
    }

    // Create user in destination
    const tempPassword = generateTempPassword();

    const { data: created, error: createError } =
      await dstClient.auth.admin.createUser({
        email: user.email,
        phone: user.phone ?? undefined,
        password: tempPassword,
        email_confirm: !!user.email_confirmed_at,
        phone_confirm: !!user.phone_confirmed_at,
        user_metadata: user.user_metadata ?? {},
        app_metadata: user.app_metadata ?? {},
      });

    if (createError) {
      // Treat duplicate email as "existing" (race condition guard)
      const isDuplicate =
        createError.message.toLowerCase().includes("already") ||
        createError.message.toLowerCase().includes("duplicate") ||
        createError.message.toLowerCase().includes("unique");

      if (isDuplicate) {
        console.log("SKIP (already exists – race)");
        report.existing++;
        report.users.push({
          source_id: user.id,
          email: user.email,
          status: "existing",
          error: createError.message,
        });
      } else {
        console.log(`FAIL — ${createError.message}`);
        report.failed++;
        report.users.push({
          source_id: user.id,
          email: user.email,
          status: "failed",
          error: createError.message,
        });
      }
      continue;
    }

    console.log(`OK (${created.user?.id})`);
    report.created++;
    report.users.push({
      source_id: user.id,
      email: user.email,
      status: "created",
      destination_id: created.user?.id,
    });

    // Add to seen set so subsequent pages don't re-attempt
    if (email) existingEmails.add(email);
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("\n=== Auth Migration Complete ===");
  console.log(`Total source users:  ${report.total_source}`);
  console.log(`Created:             ${report.created}`);
  console.log(`Already existing:    ${report.existing}`);
  console.log(`Failed:              ${report.failed}`);

  if (report.failed > 0) {
    console.warn("\n⚠️  Some users failed to migrate — see migrated_users.json for details.");
  }

  if (!DRY_RUN && report.created > 0) {
    console.log("\n⚠️  POST-MIGRATION STEPS REQUIRED:");
    console.log("  1. Send password-reset emails to all migrated users.");
    console.log("     (Their passwords were set to random temporary values.)");
    console.log("  2. Re-link OAuth providers (Google, GitHub, etc.) — these");
    console.log("     cannot be migrated automatically via the Admin API.");
    console.log("  3. Verify application-specific metadata fields were preserved.");
  }

  writeReport(report);
}

function writeReport(report: Report) {
  const path = "migrated_users.json";
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${path}`);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
