/**
 * Seed script — injects a small set of known YC companies for local dev/testing.
 * Run: pnpm db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database…");

  const orgs = [
    {
      dedupeKey: "stripe.com",
      canonicalName: "Stripe",
      domain: "stripe.com",
      website: "https://stripe.com",
      description: "Payments infrastructure for the internet",
      industry: "Fintech",
      isYcBacked: true,
      ycBatch: "S09",
      ycId: "stripe",
      status: "active",
      stageProxy: "public",
      tags: ["fintech", "payments", "saas"],
    },
    {
      dedupeKey: "airbnb.com",
      canonicalName: "Airbnb",
      domain: "airbnb.com",
      website: "https://airbnb.com",
      description: "Belongs anywhere",
      industry: "Travel",
      isYcBacked: true,
      ycBatch: "W09",
      ycId: "airbnb",
      status: "ipo",
      stageProxy: "public",
      tags: ["marketplace", "travel", "accommodation"],
    },
    {
      dedupeKey: "dropbox.com",
      canonicalName: "Dropbox",
      domain: "dropbox.com",
      website: "https://dropbox.com",
      description: "Cloud storage and file sharing",
      industry: "SaaS",
      isYcBacked: true,
      ycBatch: "S07",
      ycId: "dropbox",
      status: "ipo",
      stageProxy: "public",
      tags: ["saas", "cloud", "storage"],
    },
  ];

  for (const org of orgs) {
    await prisma.organization.upsert({
      where: { dedupeKey: org.dedupeKey },
      create: org,
      update: { canonicalName: org.canonicalName, updatedAt: new Date() },
    });
  }

  console.log(`Seeded ${orgs.length} organizations`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
