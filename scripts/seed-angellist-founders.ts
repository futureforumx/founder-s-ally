/**
 * AngelList / Wellfound-style founder rows from a local JSON export.
 *
 * There is no stable unauthenticated public API for directory-scale founder data.
 * Prepare a JSON file (e.g. from your own research or licensed export) and set:
 *   ANGELLIST_FOUNDERS_JSON_PATH=./sample-data/angellist-founders.example.json
 *
 * Shape: { "founders": [ { fullName, title, currentRole, currentStartup, angelListId?, linkedin?, email?, location?, followers?, prevStartups? } ] }
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadDatabaseUrl } from "./lib/loadDatabaseUrl";
import {
  mergeStartupProfessional,
  splitFullName,
  SOURCE_PRIORITY,
  type ProfessionalIngestPayload,
} from "./lib/startupProfessionalMerge";

loadDatabaseUrl();
const prisma = new PrismaClient();

type FileRow = {
  fullName: string;
  title?: string;
  currentRole?: string;
  currentStartup: string;
  angelListId?: string;
  linkedin?: string;
  email?: string;
  location?: string;
  followers?: number;
  prevStartups?: string[];
};

function toRow(r: FileRow): ProfessionalIngestPayload {
  const { first, last } = splitFullName(r.fullName);
  return {
    firstName: first,
    lastName: last || "",
    fullName: r.fullName.replace(/\s+/g, " ").trim(),
    title: r.title ?? `${r.currentRole ?? "Founder"} @ ${r.currentStartup}`,
    currentRole: r.currentRole ?? "Founder",
    currentStartup: r.currentStartup.trim(),
    prevStartups: r.prevStartups ?? [],
    angelListId: r.angelListId ?? null,
    linkedin: r.linkedin ?? null,
    email: r.email ?? null,
    location: r.location ?? null,
    followers: r.followers ?? 0,
    source: "angellist",
    sourcePriority: SOURCE_PRIORITY.angellist,
  };
}

async function main() {
  const p = process.env.ANGELLIST_FOUNDERS_JSON_PATH?.trim();
  if (!p) {
    console.log(
      "Skip: set ANGELLIST_FOUNDERS_JSON_PATH to a JSON file. See sample-data/angellist-founders.example.json",
    );
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const abs = join(process.cwd(), p);
  if (!existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(abs, "utf8")) as { founders?: FileRow[] };
  if (!raw.founders?.length) {
    console.error(`Expected { "founders": [...] } in ${abs}`);
    process.exit(1);
  }

  let ok = 0;
  let err = 0;
  for (const r of raw.founders.map(toRow)) {
    try {
      await mergeStartupProfessional(prisma, r);
      ok++;
    } catch {
      err++;
    }
  }
  console.log(`AngelList JSON: upserted ${ok}, errors ${err}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
