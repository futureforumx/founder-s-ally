import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Load DATABASE_URL from .env.local
import { readFileSync } from "fs";
try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const { PrismaClient } = await import("@prisma/client");
const p = new PrismaClient();

const total = await p.vCPerson.count({ where: { deleted_at: null } });
const withAvatar = await p.vCPerson.count({ where: { deleted_at: null, avatar_url: { not: null } } });
const firmLogo = await p.vCPerson.count({ where: { deleted_at: null, avatar_url: { contains: "faviconV2" } } });
const firmLogoS2 = await p.vCPerson.count({ where: { deleted_at: null, avatar_url: { contains: "s2/favicons" } } });
const gravatar = await p.vCPerson.count({ where: { deleted_at: null, avatar_url: { contains: "gravatar.com/avatar" } } });
const unavatar = await p.vCPerson.count({ where: { deleted_at: null, avatar_url: { contains: "unavatar.io" } } });

const badPatterns = ["faviconV2", "s2/favicons", "dicebear.com", "linkedin.com"];
const notClauses = badPatterns.map(p => ({ avatar_url: { contains: p } }));
const realPhoto = await p.vCPerson.count({
  where: { deleted_at: null, avatar_url: { not: null }, NOT: notClauses }
});

const samples = await p.vCPerson.findMany({
  where: { deleted_at: null, avatar_url: { not: null }, NOT: notClauses },
  select: { first_name: true, last_name: true, avatar_url: true },
  take: 10
});

console.log(JSON.stringify({ total, withAvatar, firmLogo, firmLogoS2, gravatar, unavatar, realPhoto }, null, 2));
console.log("\n--- real photo samples ---");
samples.forEach(s => console.log(`${s.first_name} ${s.last_name}: ${s.avatar_url?.substring(0, 90)}`));

await p.$disconnect();
