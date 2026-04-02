// ─── YC Algolia API response shapes ──────────────────────────────────────────

export interface YcAlgoliaHit {
  objectID: string;
  id: number;
  name: string;
  slug: string;
  website: string;
  smallLogoUrl?: string;
  oneLiner?: string;
  longDescription?: string;
  teamSize?: number;
  url?: string;
  batch?: string;
  status?: string; // "Active" | "Acquired" | "Inactive" | "Public"
  industries?: string[];
  subverticals?: string[];
  tags?: string[];
  allLocations?: string;
  isHiring?: boolean;
  nonprofit?: boolean;
  topCompany?: boolean;
  founders?: YcFounderRaw[];
  _highlightResult?: Record<string, unknown>;
}

export interface YcFounderRaw {
  id?: number;
  firstName?: string;
  lastName?: string;
  name?: string;
  title?: string;
  linkedInUrl?: string;
  twitterUrl?: string;
  avatarUrl?: string;
  bio?: string;
}

export interface YcAlgoliaResponse {
  hits: YcAlgoliaHit[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
  query: string;
  params: string;
}

export interface YcAlgoliaQuery {
  query: string;
  hitsPerPage: number;
  page: number;
  filters?: string;
  attributesToRetrieve?: string[];
  attributesToHighlight?: string[];
}
