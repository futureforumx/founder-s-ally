import { PrismaClient } from "@prisma/client";
import { loadEnvFiles } from "./loadEnvFiles.js";

loadEnvFiles([".env", ".env.local"]);

let client: PrismaClient | null = null;

/** Shared Prisma client for GHA ingest jobs (funding-ingest, vc-fund-sync, shared feeds). */
export function getPipelinePrisma(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for pipeline database access");
  }
  if (!client) {
    client = new PrismaClient();
  }
  return client;
}

export async function disconnectPipelinePrisma(): Promise<void> {
  if (!client) return;
  await client.$disconnect();
  client = null;
}
