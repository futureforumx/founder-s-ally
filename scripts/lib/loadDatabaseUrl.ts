import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Parse a single .env / .env.local file and load all KEY=VALUE pairs into
 * process.env (skipping keys that are already set so shell-level overrides win).
 */
function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue; // already set — shell wins
    let val = t.slice(eq + 1).trim();
    // Strip surrounding quotes
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val) process.env[key] = val;
  }
}

/**
 * Load ALL env vars from `.env` then `.env.local` (local wins).
 * Scripts call this once at startup so API keys etc. are available without
 * needing `dotenv` as a dependency.
 */
export function loadAllEnv(): void {
  const root = process.cwd();
  loadEnvFile(join(root, ".env"));
  loadEnvFile(join(root, ".env.local")); // local overrides
}

/** Backwards-compat: Prisma CLI loads `.env`; seed scripts also read `.env.local`. */
export function loadDatabaseUrl(): void {
  loadAllEnv();
}
