import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Prisma CLI loads `.env`; seed scripts also read `.env.local` when present. */
export function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;
  const root = process.cwd();
  for (const name of [".env", ".env.local"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^DATABASE_URL=(.*)$/);
      if (!m) continue;
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env.DATABASE_URL = v;
      return;
    }
  }
}
