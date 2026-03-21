export interface PartnerPerson {
  id: string;
  name: string;
  title: string;
  avatar_url?: string;
  focus: string[];
  personalThesis?: string;
  boardSeats?: string[];
  linkedIn?: string;
  recentArticles?: { title: string; url: string; date: string }[];
}

export interface FirmAffiliation {
  id: string;
  firm_name: string;
  logo_url?: string;
}

export interface InvestorEntry {
  name: string;
  sector: string;
  stage: string;
  description: string;
  location: string;
  model: string; // check size range
  initial: string;
  matchReason: string | null;
  category: "investor";
  partners?: PartnerPerson[];
}

export const INVESTOR_TABS = ["Updates", "Investment Thesis", "Portfolio", "Investors", "Connections"] as const;
export type InvestorTab = typeof INVESTOR_TABS[number];

// ── Mock Partners Data (Relational Glue) ──
export const MOCK_FIRM_PARTNERS: Record<string, PartnerPerson[]> = {
  "sequoia capital": [
    {
      id: "alfred-lin",
      name: "Alfred Lin",
      title: "Partner",
      focus: ["B2B SaaS", "Enterprise"],
      personalThesis: "Backs founders who obsess over unit economics and long-term defensibility. Prefers category-defining companies with network effects.",
      boardSeats: ["DoorDash", "Airbnb", "Instacart"],
      linkedIn: "https://linkedin.com/in/alfredlin",
      recentArticles: [
        { title: "Why Unit Economics Still Matter in 2026", url: "#", date: "2026-02-15" },
        { title: "The Next Wave of Enterprise AI", url: "#", date: "2026-01-20" },
      ],
    },
    {
      id: "jess-lee",
      name: "Jess Lee",
      title: "Partner",
      focus: ["Consumer", "Marketplace"],
      personalThesis: "Focused on consumer experiences that create new behaviors. Deep expertise in marketplaces, communities, and social commerce.",
      boardSeats: ["Poshmark", "Carbon Health"],
      linkedIn: "https://linkedin.com/in/jesslee",
      recentArticles: [
        { title: "Community-Led Growth: Beyond PLG", url: "#", date: "2026-03-01" },
      ],
    },
    {
      id: "pat-grady",
      name: "Pat Grady",
      title: "Partner",
      focus: ["Cloud Infrastructure", "DevTools"],
      personalThesis: "Invests at the intersection of developer experience and infrastructure. Looks for 10x improvements in developer productivity.",
      boardSeats: ["Notion", "Figma", "Confluent"],
      linkedIn: "https://linkedin.com/in/patgrady",
      recentArticles: [
        { title: "Infrastructure Eats Everything", url: "#", date: "2026-02-28" },
        { title: "AI-Native DevTools Are Coming", url: "#", date: "2026-01-10" },
      ],
    },
  ],
  "lux capital": [
    {
      id: "josh-wolfe",
      name: "Josh Wolfe",
      title: "Managing Partner",
      focus: ["Deep Tech", "Defense"],
      personalThesis: "Invests in 'the future that's inevitable but underestimated.' Fascinated by the intersection of atoms and bits.",
      boardSeats: ["Anduril", "Kebotix"],
      linkedIn: "https://linkedin.com/in/joshwolfe",
      recentArticles: [
        { title: "The Dual-Use Imperative", url: "#", date: "2026-03-10" },
      ],
    },
    {
      id: "deena-shakir",
      name: "Deena Shakir",
      title: "Partner",
      focus: ["Health Tech", "AI"],
      personalThesis: "Backs mission-driven founders using AI to transform healthcare access and outcomes.",
      boardSeats: ["Maven Clinic", "Cityblock Health"],
      linkedIn: "https://linkedin.com/in/deenashakir",
      recentArticles: [
        { title: "AI in Healthcare: Promise vs. Reality", url: "#", date: "2026-02-05" },
      ],
    },
  ],
  "first round capital": [
    {
      id: "todd-jackson",
      name: "Todd Jackson",
      title: "Partner",
      focus: ["Consumer", "SaaS"],
      personalThesis: "Former VP Product at Dropbox and Twitter. Looks for elegant products that solve real pain points with delightful UX.",
      boardSeats: ["Notion (early)", "Superhuman"],
      linkedIn: "https://linkedin.com/in/toddjackson",
      recentArticles: [
        { title: "Product-Led Growth in 2026", url: "#", date: "2026-01-28" },
      ],
    },
  ],
  "a16z": [
    {
      id: "marc-andreessen",
      name: "Marc Andreessen",
      title: "Co-Founder & General Partner",
      focus: ["Software", "Crypto", "AI"],
      personalThesis: "Software is eating the world. Backs bold founders building transformative technology platforms.",
      boardSeats: ["Meta", "Coinbase"],
      linkedIn: "https://linkedin.com/in/marcandreessen",
      recentArticles: [
        { title: "The Techno-Optimist Manifesto Update", url: "#", date: "2026-03-15" },
      ],
    },
    {
      id: "vijay-pande",
      name: "Vijay Pande",
      title: "General Partner",
      focus: ["Bio", "Health"],
      personalThesis: "Stanford professor turned investor. Deep conviction in computational biology and AI-driven drug discovery.",
      boardSeats: ["Freenome", "Insitro"],
      linkedIn: "https://linkedin.com/in/vijaypande",
      recentArticles: [],
    },
  ],
  "founders fund": [
    {
      id: "keith-rabois",
      name: "Keith Rabois",
      title: "Managing Director",
      focus: ["Fintech", "Real Estate"],
      personalThesis: "Operator-investor who built PayPal, LinkedIn, Square. Backs contrarian founders in regulated industries.",
      boardSeats: ["OpenDoor", "Affirm"],
      linkedIn: "https://linkedin.com/in/keithrabois",
      recentArticles: [
        { title: "Regulated Markets Are the Best Markets", url: "#", date: "2026-02-20" },
      ],
    },
  ],
};

// Build reverse lookup: person → firm
export function getFirmForPerson(personId: string): (FirmAffiliation & { firmEntry?: InvestorEntry }) | null {
  for (const [firmKey, partners] of Object.entries(MOCK_FIRM_PARTNERS)) {
    if (partners.some(p => p.id === personId)) {
      return {
        id: firmKey,
        firm_name: partners[0] ? firmKey.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : firmKey,
      };
    }
  }
  return null;
}

export function getPartnerById(personId: string): PartnerPerson | null {
  for (const partners of Object.values(MOCK_FIRM_PARTNERS)) {
    const found = partners.find(p => p.id === personId);
    if (found) return found;
  }
  return null;
}

export function getPartnersForFirm(firmName: string): PartnerPerson[] {
  return MOCK_FIRM_PARTNERS[firmName.toLowerCase().trim()] || [];
}
