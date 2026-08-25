/**
 * Look up HQ + description on startups.gallery for named companies (no DB writes).
 *
 *   npx tsx scripts/funding-intel/print-gallery-profiles.ts "Helcim" "Callosum"
 */
import { fetchGalleryCompanyProfileFromPages } from "../lib/galleryCompanyPage.js";
import {
  findGalleryCompanyEntry,
  galleryProfileIsIncomplete,
  mergeGalleryCompanyProfile,
  pickGalleryCompanyProfile,
} from "../../src/lib/galleryCompanyProfile";
import { fetchStartupsGallerySearchIndex, splitInvestorsAndCompanies } from "../lib/startupsGalleryIndex";

const names = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
if (names.length === 0) {
  console.error('usage: npx tsx scripts/funding-intel/print-gallery-profiles.ts "Helcim" "Enigma|enigma-robotics"');
  process.exit(1);
}

function parseArg(raw: string): { name: string; slug: string | null } {
  const cut = raw.indexOf("|");
  if (cut < 0) return { name: raw, slug: null };
  return { name: raw.slice(0, cut).trim(), slug: raw.slice(cut + 1).trim() || null };
}

const index = await fetchStartupsGallerySearchIndex();
const { companies } = splitInvestorsAndCompanies(index);

const out: Array<{
  name: string;
  matched: boolean;
  sector: string | null;
  hqLine: string | null;
  description: string | null;
}> = [];

for (const raw of names) {
  const { name, slug } = parseArg(raw);
  const match = findGalleryCompanyEntry(companies, name, slug);
  let profile = pickGalleryCompanyProfile(match?.entry);
  if (galleryProfileIsIncomplete(profile)) {
    const fromPage = await fetchGalleryCompanyProfileFromPages(name, slug ?? match?.path);
    profile = mergeGalleryCompanyProfile(profile, fromPage);
  }
  out.push({
    name,
    matched: Boolean(match),
    sector: profile.sector,
    hqLine: profile.hqLine,
    description: profile.description,
  });
}

console.log(JSON.stringify(out, null, 2));
