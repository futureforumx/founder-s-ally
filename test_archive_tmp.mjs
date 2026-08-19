import { fetchTechcrunchVentureArchive, fetchAlleywatchFundingArchive } from "./scripts/funding-ingest/sources.js";
const since = new Date("2026-05-07T01:10:27.322Z");
const log = (s) => console.log("[log]", s);

const tc = await fetchTechcrunchVentureArchive(since, 500, log);
console.log("TC archive items since May 7:", tc.length);
console.log("oldest:", tc[tc.length-1]?.publishedAt, tc[tc.length-1]?.title);
console.log("newest:", tc[0]?.publishedAt, tc[0]?.title);

const aw = await fetchAlleywatchFundingArchive(since, 500, log);
console.log("AW archive items since May 7:", aw.length);
console.log("oldest:", aw[aw.length-1]?.publishedAt, aw[aw.length-1]?.title);
console.log("newest:", aw[0]?.publishedAt, aw[0]?.title);
