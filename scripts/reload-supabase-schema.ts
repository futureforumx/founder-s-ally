/**
 * reload-supabase-schema.ts
 *
 * Sends NOTIFY pgrst, 'reload schema' directly to PostgreSQL via Prisma.
 * This forces Supabase PostgREST to pick up newly created tables immediately,
 * without waiting for the automatic cache refresh cycle.
 *
 * Usage:
 *   npm run db:reload-schema
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Reloading Supabase PostgREST schema cache...");
  await prisma.$executeRawUnsafe(`SELECT pg_notify('pgrst', 'reload schema')`);
  console.log("Done. PostgREST will pick up new tables within a few seconds.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
