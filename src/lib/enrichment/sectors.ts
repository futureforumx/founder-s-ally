/**
 * Fixed Latest Funding sector taxonomy + classifiers used by intel:funding:pipeline.
 */

export const FUNDING_SECTOR_TAXONOMY = [
  "AI / ML",
  "Fintech",
  "Enterprise SaaS",
  "Health / Bio",
  "Consumer",
  "Crypto / Web3",
  "Climate / Energy",
  "Cybersecurity",
  "Hardware / Deeptech",
  "Developer Tools",
] as const;

export type FundingSector = (typeof FUNDING_SECTOR_TAXONOMY)[number];

const TAXONOMY_SET = new Set<string>(FUNDING_SECTOR_TAXONOMY);

const ALIAS_TO_TAXONOMY: Record<string, FundingSector> = {
  ai: "AI / ML",
  "ai / ml": "AI / ML",
  "ai/ml": "AI / ML",
  "artificial intelligence": "AI / ML",
  "machine learning": "AI / ML",
  fintech: "Fintech",
  "fin tech": "Fintech",
  "financial technology": "Fintech",
  "enterprise saas": "Enterprise SaaS",
  saas: "Enterprise SaaS",
  "b2b saas": "Enterprise SaaS",
  healthtech: "Health / Bio",
  healthcare: "Health / Bio",
  "health / bio": "Health / Bio",
  biotech: "Health / Bio",
  biotechnology: "Health / Bio",
  consumer: "Consumer",
  crypto: "Crypto / Web3",
  web3: "Crypto / Web3",
  "crypto / web3": "Crypto / Web3",
  climate: "Climate / Energy",
  "climate / energy": "Climate / Energy",
  cleantech: "Climate / Energy",
  energy: "Climate / Energy",
  cybersecurity: "Cybersecurity",
  "cyber security": "Cybersecurity",
  hardware: "Hardware / Deeptech",
  deeptech: "Hardware / Deeptech",
  "hardware / deeptech": "Hardware / Deeptech",
  "developer tools": "Developer Tools",
  devtools: "Developer Tools",
  "dev tools": "Developer Tools",
};

const KEYWORD_RULES: Array<[RegExp, FundingSector]> = [
  [/\b(fintech|embedded finance|open banking|payments? infrastructure|card issuing|lending platform|bnpl|wealth\s*tech|spend management|merchant intelligence)\b/i, "Fintech"],
  [/\b(healthtech|digital health|clinical trial|medical device|therapeutics|genomics|biotech|biopharma)\b/i, "Health / Bio"],
  [/\b(cybersecurity|infosec|endpoint security|zero trust|siem|identity threat)\b/i, "Cybersecurity"],
  [/\b(climate tech|carbon accounting|clean energy|decarbon|renewable|climatetech|energy storage)\b/i, "Climate / Energy"],
  [/\b(web3|defi|blockchain|cryptocurrenc|nft\b|on-chain)\b/i, "Crypto / Web3"],
  [/\b(semiconductor|robotics|quantum|deep ?tech|hardware startup|chip design)\b/i, "Hardware / Deeptech"],
  [/\b(developer tools|devtools|ci\/cd|observability|api platform|sdk)\b/i, "Developer Tools"],
  [/\b(enterprise saas|b2b saas|workflow automation|vertical saas)\b/i, "Enterprise SaaS"],
  [/\b(d2c|consumer brand|consumer app|marketplace for consumers)\b/i, "Consumer"],
  [/\b(artificial intelligence|machine learning|\bllm\b|generative ai|ai-native|ai powered)\b/i, "AI / ML"],
];

export function isMissingSector(value: string | null | undefined): boolean {
  const t = value?.trim().toLowerCase() ?? "";
  return !t || t === "unknown" || t === "n/a" || t === "none";
}

export function coerceToFundingSector(raw: string | null | undefined): FundingSector | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (TAXONOMY_SET.has(trimmed)) return trimmed as FundingSector;
  const key = trimmed.toLowerCase().replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ").trim();
  if (ALIAS_TO_TAXONOMY[key]) return ALIAS_TO_TAXONOMY[key];
  const compact = key.replace(/\s+/g, "");
  for (const [alias, sector] of Object.entries(ALIAS_TO_TAXONOMY)) {
    if (alias.replace(/\s+/g, "") === compact) return sector;
  }
  return null;
}

export function classifySectorFromKeywords(
  companyName: string,
  headline: string,
  articleSummary: string,
): FundingSector | null {
  const blob = `${companyName}\n${headline}\n${articleSummary}`.slice(0, 8000);
  for (const [re, sector] of KEYWORD_RULES) {
    if (re.test(blob)) return sector;
  }
  return null;
}

export const SECTOR_CLASSIFIER_SYSTEM_PROMPT = [
  "You classify startup funding announcements into exactly one sector.",
  `Return ONLY one of these labels: ${FUNDING_SECTOR_TAXONOMY.join(", ")}.`,
  "Do not invent categories. If none fit, return Enterprise SaaS for B2B software, otherwise Consumer.",
].join(" ");

export function parseSectorModelOutput(raw: string | null | undefined): FundingSector | null {
  if (!raw?.trim()) return null;
  const stripped = raw.trim().replace(/^["'`]+|["'`]+$/g, "");
  const direct = coerceToFundingSector(stripped);
  if (direct) return direct;
  for (const label of FUNDING_SECTOR_TAXONOMY) {
    if (stripped.toLowerCase().includes(label.toLowerCase())) return label;
  }
  return null;
}

export async function classifySectorWithOpenAI(args: {
  companyName: string;
  headline: string;
  articleSummary: string;
  apiKey?: string;
  model?: string;
}): Promise<FundingSector | null> {
  const apiKey = args.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      max_tokens: 24,
      messages: [
        { role: "system", content: SECTOR_CLASSIFIER_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            company_name: args.companyName,
            headline: args.headline,
            article_summary: args.articleSummary.slice(0, 4000),
          }),
        },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return parseSectorModelOutput(data.choices?.[0]?.message?.content);
}

export async function classifyDealSector(args: {
  companyName: string;
  headline: string;
  articleSummary: string;
  allowOpenAI?: boolean;
}): Promise<{ sector: FundingSector; method: "keywords" | "openai" } | null> {
  const fromKeywords = classifySectorFromKeywords(args.companyName, args.headline, args.articleSummary);
  if (fromKeywords) return { sector: fromKeywords, method: "keywords" };
  if (args.allowOpenAI === false) return null;
  const fromModel = await classifySectorWithOpenAI(args);
  if (fromModel) return { sector: fromModel, method: "openai" };
  return null;
}
