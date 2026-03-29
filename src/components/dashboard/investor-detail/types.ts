// ── Re-export shared content type so consumers don't need to import from useVCDirectory ──
export interface PartnerContent {
  title: string;
  published_at: string | null;
  content_type: "BLOG_POST" | "TWEET" | "LINKEDIN_POST" | "PODCAST" | "VIDEO" | "NEWSLETTER" | "PRESS" | "INTERVIEW" | "RESEARCH" | "OTHER";
  source_name: string | null;
  source_url: string | null;
  summary: string | null;
  themes: string[];
}

export interface PartnerPerson {
  // ── Identity ──
  id: string;
  full_name: string;                      // primary display name
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  title: string | null;
  investor_type?: string | null;
  seniority?: string | null;
  is_active?: boolean;

  // ── Profile image ──
  profile_image_url?: string | null;
  avatar_url?: string | null;             // legacy alias → profile_image_url

  // ── Affiliation ──
  firm_id?: string;
  primary_firm_name?: string | null;
  affiliation_type?: string | null;
  affiliation_start_date?: string | null;
  affiliation_end_date?: string | null;
  is_primary_affiliation?: boolean;

  // ── Contact ──
  email?: string | null;
  linkedin_url?: string | null;
  x_url?: string | null;
  website_url?: string | null;
  contactability_status?: "OPEN" | "WARM_INTRO_ONLY" | "CLOSED" | "UNKNOWN";
  warm_intro_preferred?: boolean;
  cold_outreach_ok?: boolean;
  preferred_contact_method?: string | null;

  // ── Investing preferences ──
  stage_focus?: string[] | null;          // primary display: investment stages
  sector_focus?: string[] | null;         // primary display: sectors
  geography_focus?: string[];
  check_size_min?: number | null;
  check_size_max?: number | null;
  check_size_avg_usd?: number | null;
  lead_or_follow?: string | null;
  board_seat_preference?: string | null;
  solo_founder_preference?: string | null;
  thesis_summary?: string | null;
  personal_thesis_tags?: string[];
  investment_criteria_qualities?: string[];

  // ── Background ──
  background_summary?: string | null;
  notable_credentials?: string[];
  personal_qualities?: string[];
  education_summary?: string | null;      // legacy alias

  // ── Content ──
  published_content?: PartnerContent[] | null;

  // ── Scores ──
  match_score?: number | null;
  reputation_score?: number | null;
  responsiveness_score?: number | null;
  value_add_score?: number | null;
  founder_sentiment_score?: number | null;
  active_deployment_score?: number | null;
  confidence_score?: number | null;

  // ── Legacy shims (kept for backwards compatibility) ──
  name?: string;                          // @deprecated — use full_name
  focus?: string[];                       // @deprecated — use stage_focus / sector_focus
  personalThesis?: string;               // @deprecated — use thesis_summary
  boardSeats?: string[];                 // @deprecated
  linkedIn?: string;                     // @deprecated — use linkedin_url
  recentArticles?: { title: string; url: string; date: string }[]; // @deprecated — use published_content
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
  logo_url?: string | null;
  /** `investor_database.id` when the row came from Supabase (not an MDM domain id). */
  investorDatabaseId?: string | null;
  websiteUrl?: string | null;
}

export const INVESTOR_TABS = ["Updates", "Activity", "Investment Thesis", "Portfolio", "Investors", "Feedback", "Connect"] as const;
export type InvestorTab = typeof INVESTOR_TABS[number];

// ── Mock Partners Data (Relational Glue) ──
// Uses new field names; legacy shims kept for any components not yet migrated.
export const MOCK_FIRM_PARTNERS: Record<string, PartnerPerson[]> = {
  "sequoia capital": [
    {
      id: "alfred-lin",
      full_name: "Alfred Lin",
      name: "Alfred Lin",
      title: "Partner",
      seniority: "PARTNER",
      investor_type: "GENERAL_PARTNER",
      primary_firm_name: "Sequoia Capital",
      sector_focus: ["B2B SaaS", "Enterprise"],
      focus: ["B2B SaaS", "Enterprise"],
      thesis_summary: "Backs founders who obsess over unit economics and long-term defensibility. Prefers category-defining companies with network effects.",
      personalThesis: "Backs founders who obsess over unit economics and long-term defensibility. Prefers category-defining companies with network effects.",
      boardSeats: ["DoorDash", "Airbnb", "Instacart"],
      linkedin_url: "https://linkedin.com/in/alfredlin",
      linkedIn: "https://linkedin.com/in/alfredlin",
      contactability_status: "OPEN",
      is_active: true,
      published_content: [
        { title: "Why Unit Economics Still Matter in 2026", published_at: "2026-02-15", content_type: "BLOG_POST", source_name: "Sequoia Blog", source_url: "#", summary: null, themes: ["unit economics", "venture"] },
        { title: "The Next Wave of Enterprise AI", published_at: "2026-01-20", content_type: "BLOG_POST", source_name: "Sequoia Blog", source_url: "#", summary: null, themes: ["AI", "enterprise"] },
      ],
      recentArticles: [
        { title: "Why Unit Economics Still Matter in 2026", url: "#", date: "2026-02-15" },
        { title: "The Next Wave of Enterprise AI", url: "#", date: "2026-01-20" },
      ],
    },
    {
      id: "jess-lee",
      full_name: "Jess Lee",
      name: "Jess Lee",
      title: "Partner",
      seniority: "PARTNER",
      investor_type: "GENERAL_PARTNER",
      primary_firm_name: "Sequoia Capital",
      sector_focus: ["Consumer", "Marketplace"],
      focus: ["Consumer", "Marketplace"],
      thesis_summary: "Focused on consumer experiences that create new behaviors. Deep expertise in marketplaces, communities, and social commerce.",
      personalThesis: "Focused on consumer experiences that create new behaviors. Deep expertise in marketplaces, communities, and social commerce.",
      boardSeats: ["Poshmark", "Carbon Health"],
      linkedin_url: "https://linkedin.com/in/jesslee",
      linkedIn: "https://linkedin.com/in/jesslee",
      contactability_status: "OPEN",
      is_active: true,
      published_content: [
        { title: "Community-Led Growth: Beyond PLG", published_at: "2026-03-01", content_type: "BLOG_POST", source_name: "Sequoia Blog", source_url: "#", summary: null, themes: ["community", "growth"] },
      ],
      recentArticles: [{ title: "Community-Led Growth: Beyond PLG", url: "#", date: "2026-03-01" }],
    },
    {
      id: "pat-grady",
      full_name: "Pat Grady",
      name: "Pat Grady",
      title: "Partner",
      seniority: "PARTNER",
      investor_type: "GENERAL_PARTNER",
      primary_firm_name: "Sequoia Capital",
      sector_focus: ["Cloud Infrastructure", "DevTools"],
      focus: ["Cloud Infrastructure", "DevTools"],
      thesis_summary: "Invests at the intersection of developer experience and infrastructure. Looks for 10x improvements in developer productivity.",
      personalThesis: "Invests at the intersection of developer experience and infrastructure. Looks for 10x improvements in developer productivity.",
      boardSeats: ["Notion", "Figma", "Confluent"],
      linkedin_url: "https://linkedin.com/in/patgrady",
      linkedIn: "https://linkedin.com/in/patgrady",
      contactability_status: "OPEN",
      is_active: true,
      published_content: [
        { title: "Infrastructure Eats Everything", published_at: "2026-02-28", content_type: "BLOG_POST", source_name: "Sequoia Blog", source_url: "#", summary: null, themes: ["infrastructure"] },
        { title: "AI-Native DevTools Are Coming", published_at: "2026-01-10", content_type: "BLOG_POST", source_name: "Sequoia Blog", source_url: "#", summary: null, themes: ["AI", "devtools"] },
      ],
      recentArticles: [
        { title: "Infrastructure Eats Everything", url: "#", date: "2026-02-28" },
        { title: "AI-Native DevTools Are Coming", url: "#", date: "2026-01-10" },
      ],
    },
  ],
  "lux capital": [
    {
      id: "josh-wolfe",
      full_name: "Josh Wolfe",
      name: "Josh Wolfe",
      title: "Managing Partner",
      seniority: "MANAGING_PARTNER",
      investor_type: "GENERAL_PARTNER",
      primary_firm_name: "Lux Capital",
      sector_focus: ["Deep Tech", "Defense"],
      focus: ["Deep Tech", "Defense"],
      thesis_summary: "Invests in 'the future that's inevitable but underestimated.' Fascinated by the intersection of atoms and bits.",
      personalThesis: "Invests in 'the future that's inevitable but underestimated.' Fascinated by the intersection of atoms and bits.",
      boardSeats: ["Anduril", "Kebotix"],
      linkedin_url: "https://linkedin.com/in/joshwolfe",
      linkedIn: "https://linkedin.com/in/joshwolfe",
      contactability_status: "WARM_INTRO_ONLY",
      is_active: true,
      published_content: [
        { title: "The Dual-Use Imperative", published_at: "2026-03-10", content_type: "BLOG_POST", source_name: "Lux Capital", source_url: "#", summary: null, themes: ["deep tech", "defense"] },
      ],
      recentArticles: [{ title: "The Dual-Use Imperative", url: "#", date: "2026-03-10" }],
    },
    {
      id: "deena-shakir",
      full_name: "Deena Shakir",
      name: "Deena Shakir",
      title: "Partner",
      seniority: "PARTNER",
      investor_type: "GENERAL_PARTNER",
      primary_firm_name: "Lux Capital",
      sector_focus: ["Health Tech", "AI"],
      focus: ["Health Tech", "AI"],
      thesis_summary: "Backs mission-driven founders using AI to transform healthcare access and outcomes.",
      personalThesis: "Backs mission-driven founders using AI to transform healthcare access and outcomes.",
      boardSeats: ["Maven Clinic", "Cityblock Health"],
      linkedin_url: "https://linkedin.com/in/deenashakir",
      linkedIn: "https://linkedin.com/in/deenashakir",
      contactability_status: "OPEN",
      is_active: true,
      published_content: [
        { title: "AI in Healthcare: Promise vs. Reality", published_at: "2026-02-05", content_type: "BLOG_POST", source_name: "Lux Capital", source_url: "#", summary: null, themes: ["AI", "health"] },
      ],
      recentArticles: [{ title: "AI in Healthcare: Promise vs. Reality", url: "#", date: "2026-02-05" }],
    },
  ],
  "first round capital": [
    {
      id: "todd-jackson",
      full_name: "Todd Jackson",
      name: "Todd Jackson",
      title: "Partner",
      seniority: "PARTNER",
      investor_type: "GENERAL_PARTNER",
      primary_firm_name: "First Round Capital",
      sector_focus: ["Consumer", "SaaS"],
      focus: ["Consumer", "SaaS"],
      thesis_summary: "Former VP Product at Dropbox and Twitter. Looks for elegant products that solve real pain points with delightful UX.",
      personalThesis: "Former VP Product at Dropbox and Twitter. Looks for elegant products that solve real pain points with delightful UX.",
      boardSeats: ["Notion (early)", "Superhuman"],
      linkedin_url: "https://linkedin.com/in/toddjackson",
      linkedIn: "https://linkedin.com/in/toddjackson",
      contactability_status: "OPEN",
      is_active: true,
      published_content: [
        { title: "Product-Led Growth in 2026", published_at: "2026-01-28", content_type: "BLOG_POST", source_name: "First Round Review", source_url: "#", summary: null, themes: ["PLG", "product"] },
      ],
      recentArticles: [{ title: "Product-Led Growth in 2026", url: "#", date: "2026-01-28" }],
    },
  ],
  "a16z": [
    {
      id: "marc-andreessen",
      full_name: "Marc Andreessen",
      name: "Marc Andreessen",
      title: "Co-Founder & General Partner",
      seniority: "MANAGING_PARTNER",
      investor_type: "GENERAL_PARTNER",
      primary_firm_name: "Andreessen Horowitz",
      sector_focus: ["Software", "Crypto", "AI"],
      focus: ["Software", "Crypto", "AI"],
      thesis_summary: "Software is eating the world. Backs bold founders building transformative technology platforms.",
      personalThesis: "Software is eating the world. Backs bold founders building transformative technology platforms.",
      boardSeats: ["Meta", "Coinbase"],
      linkedin_url: "https://linkedin.com/in/marcandreessen",
      linkedIn: "https://linkedin.com/in/marcandreessen",
      contactability_status: "CLOSED",
      is_active: true,
      published_content: [
        { title: "The Techno-Optimist Manifesto Update", published_at: "2026-03-15", content_type: "BLOG_POST", source_name: "a16z", source_url: "#", summary: null, themes: ["technology", "optimism"] },
      ],
      recentArticles: [{ title: "The Techno-Optimist Manifesto Update", url: "#", date: "2026-03-15" }],
    },
    {
      id: "vijay-pande",
      full_name: "Vijay Pande",
      name: "Vijay Pande",
      title: "General Partner",
      seniority: "GENERAL_PARTNER",
      investor_type: "GENERAL_PARTNER",
      primary_firm_name: "Andreessen Horowitz",
      sector_focus: ["Bio", "Health"],
      focus: ["Bio", "Health"],
      thesis_summary: "Stanford professor turned investor. Deep conviction in computational biology and AI-driven drug discovery.",
      personalThesis: "Stanford professor turned investor. Deep conviction in computational biology and AI-driven drug discovery.",
      boardSeats: ["Freenome", "Insitro"],
      linkedin_url: "https://linkedin.com/in/vijaypande",
      linkedIn: "https://linkedin.com/in/vijaypande",
      contactability_status: "WARM_INTRO_ONLY",
      is_active: true,
      published_content: [],
      recentArticles: [],
    },
  ],
  "founders fund": [
    {
      id: "keith-rabois",
      full_name: "Keith Rabois",
      name: "Keith Rabois",
      title: "Managing Director",
      seniority: "MANAGING_PARTNER",
      investor_type: "GENERAL_PARTNER",
      primary_firm_name: "Founders Fund",
      sector_focus: ["Fintech", "Real Estate"],
      focus: ["Fintech", "Real Estate"],
      thesis_summary: "Operator-investor who built PayPal, LinkedIn, Square. Backs contrarian founders in regulated industries.",
      personalThesis: "Operator-investor who built PayPal, LinkedIn, Square. Backs contrarian founders in regulated industries.",
      boardSeats: ["OpenDoor", "Affirm"],
      linkedin_url: "https://linkedin.com/in/keithrabois",
      linkedIn: "https://linkedin.com/in/keithrabois",
      contactability_status: "WARM_INTRO_ONLY",
      is_active: true,
      published_content: [
        { title: "Regulated Markets Are the Best Markets", published_at: "2026-02-20", content_type: "BLOG_POST", source_name: "Founders Fund", source_url: "#", summary: null, themes: ["fintech", "regulation"] },
      ],
      recentArticles: [{ title: "Regulated Markets Are the Best Markets", url: "#", date: "2026-02-20" }],
    },
    {
      id: "lauren-gross-foundersfund.com",
      full_name: "Lauren Gross",
      name: "Lauren Gross",
      title: "Partner",
      seniority: "PARTNER",
      investor_type: "GENERAL_PARTNER",
      primary_firm_name: "Founders Fund",
      sector_focus: ["Consumer", "Gaming"],
      focus: ["Consumer", "Gaming"],
      thesis_summary: "Invests at the intersection of consumer, gaming, and frontier technology.",
      personalThesis: "Invests at the intersection of consumer, gaming, and frontier technology.",
      boardSeats: [],
      linkedin_url: "https://linkedin.com/in/lauren-gross",
      linkedIn: "https://linkedin.com/in/lauren-gross",
      contactability_status: "OPEN",
      is_active: true,
      published_content: [],
      recentArticles: [],
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
