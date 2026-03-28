/**
 * Seed `vc_ratings` for demo / QA (Prisma → same DB as Supabase).
 *
 * Usage: `npx tsx scripts/seed_vc_ratings.ts`
 * Requires DATABASE_URL. Targets firm slug `sequoia-capital` or first firm with that slug pattern.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_SLUG = "sequoia-capital";
const TARGET_DATE = "2026-03-17";

type It = "meeting" | "email" | "intro" | "other";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function meetingScores() {
  return {
    scoreResp: pick([3, 4, 4, 5, 5]),
    scoreRespect: pick([4, 4, 5, 5]),
    scoreFeedback: pick([3, 4, 5, 5]),
    scoreFollowThru: pick([2, 3, 4, 5]),
    scoreValueAdd: pick([3, 4, 5, 5]),
  };
}

function emailScores() {
  return {
    scoreResp: pick([2, 3, 4, 4]),
    scoreRespect: pick([3, 4, 5]),
    scoreFeedback: pick([3, 4, 4, 5]),
    scoreFollowThru: null as number | null,
    scoreValueAdd: null as number | null,
  };
}

function introScores() {
  return {
    scoreResp: pick([4, 5, 5]),
    scoreRespect: pick([4, 4, 5]),
    scoreFeedback: null as number | null,
    scoreFollowThru: null as number | null,
    scoreValueAdd: null as number | null,
  };
}

function otherScores() {
  return {
    scoreResp: pick([3, 4, 5]),
    scoreRespect: null as number | null,
    scoreFeedback: null as number | null,
    scoreFollowThru: null as number | null,
    scoreValueAdd: null as number | null,
  };
}

function scoresForType(t: It) {
  if (t === "meeting") return meetingScores();
  if (t === "email") return emailScores();
  if (t === "intro") return introScores();
  return otherScores();
}

function npsForStars(avg: number): number {
  if (avg >= 4.5) return pick([8, 9, 9, 10, 10]);
  if (avg >= 3.5) return pick([6, 7, 8, 8]);
  if (avg >= 2.5) return pick([4, 5, 6, 7]);
  return pick([0, 1, 2, 3, 4]);
}

async function main() {
  const firm =
    (await prisma.vCFirm.findFirst({ where: { slug: TARGET_SLUG } })) ??
    (await prisma.vCFirm.findFirst({ where: { firm_name: { contains: "Sequoia", mode: "insensitive" } } }));

  if (!firm) {
    console.error("No firm found (slug sequoia-capital or name ~ Sequoia). Seed vc_firms first.");
    process.exit(1);
  }

  const people = await prisma.vCPerson.findMany({
    where: { firm_id: firm.id, deleted_at: null },
    take: 5,
    select: { id: true },
  });
  const personIds = people.map((p) => p.id);

  const comments: Partial<Record<It, string[]>> = {
    meeting: [
      "Killed it on intros",
      "Sharp diligence questions",
      "Ghosted after diligence",
      "Partner was direct and helpful",
    ],
    email: ["2-week reply", "Same-day response", "Never heard back", "Short pass with feedback"],
    intro: ["Warm double opt-in", "High-quality founder intro"],
    other: ["Met at demo day", "Follow-up from portfolio intro"],
  };

  await prisma.vCRating.deleteMany({ where: { vcFirmId: firm.id } });

  const distribution: It[] = [
    ...Array(12).fill("meeting"),
    ...Array(8).fill("email"),
    ...Array(3).fill("intro"),
  ] as It[];
  while (distribution.length < 23) distribution.push("other");

  const rows = distribution.map((interactionType, i) => {
    const s = scoresForType(interactionType);
    const vals = [s.scoreResp, s.scoreRespect, s.scoreFeedback, s.scoreFollowThru, s.scoreValueAdd].filter(
      (x): x is number => typeof x === "number",
    );
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const useTargetDate = i % 4 === 0;
    const vcPersonId = personIds.length && Math.random() > 0.55 ? pick(personIds) : null;
    const pool = comments[interactionType] ?? ["No comment"];
    return {
      authorUserId: null,
      vcFirmId: firm.id,
      vcPersonId,
      interactionType,
      interactionDetail: interactionType === "other" ? "Demo day / event" : null,
      interactionDate: useTargetDate ? new Date(TARGET_DATE) : null,
      ...s,
      nps: npsForStars(avg),
      comment: pick(pool),
      anonymous: Math.random() > 0.25,
      verified: i === 0,
    };
  });

  await prisma.vCRating.createMany({ data: rows });
  console.log(`Inserted ${rows.length} vc_ratings for ${firm.firm_name} (${firm.id}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
