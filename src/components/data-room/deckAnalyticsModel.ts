export interface DeckAnalyticsSummary {
  totalViews: number;
  uniqueVisitors: number;
  /** Mean active seconds per started session. Null when nobody has opened the deck. */
  averageViewingSeconds: number | null;
  /** Null when this PDF has no known page count. */
  completionRate: number | null;
  inboundQuestions: number;
}

export interface SlideDwellMetric {
  slideNumber: number;
  title: string | null;
  viewCount: number;
  averageSeconds: number;
  /** Share of viewers on this slide who did not reach the next one, from 0 to 100. Null on the last slide. */
  dropOffRate: number | null;
  isHotspot: boolean;
  isHighDropOff: boolean;
}

export type DiligenceSignal = "likely_forwarded" | "high_conviction" | "quick_dropoff";

export interface LinkActivityRow {
  id: string;
  recipientLabel: string;
  url: string;
  views: number;
  averageSeconds: number | null;
  slidesViewed: number | null;
  slideCount: number | null;
  questions: number;
  lastActiveAt: string | null;
  signal: DiligenceSignal | null;
  status: "active" | "revoked" | "expired";
}

export interface SlideQuestionItem {
  id: string;
  slideNumber: number;
  body: string;
  recipientLabel: string;
  createdAt: string;
  viewerEmail: string | null;
  resolved: boolean;
  linkId: string | null;
}

export interface DeckAnalyticsDashboard {
  summary: DeckAnalyticsSummary;
  slides: SlideDwellMetric[];
  links: LinkActivityRow[];
  questions: SlideQuestionItem[];
  definitions: {
    views: string;
    viewingTime: string;
    sessions: string;
    completion: string;
  };
}

interface RawSlide {
  slideNumber?: unknown;
  viewers?: unknown;
  activeSecondsEstimate?: unknown;
  title?: unknown;
  category?: unknown;
}

interface RawLink {
  id?: unknown;
  name?: unknown;
  intendedInvestorName?: unknown;
  intendedInvestorFirm?: unknown;
  totalVisits?: unknown;
  uniqueViewers?: unknown;
  viewingSecondsEstimate?: unknown;
  completionRate?: unknown;
  lastActivityAt?: unknown;
  revokedAt?: unknown;
  expiresAt?: unknown;
  slideEngagement?: unknown;
  questionCount?: unknown;
}

interface RawQuestion {
  id?: unknown;
  slideNumber?: unknown;
  body?: unknown;
  question?: unknown;
  linkId?: unknown;
  shareId?: unknown;
  recipientLabel?: unknown;
  viewerEmail?: unknown;
  createdAt?: unknown;
  timestamp?: unknown;
  resolved?: unknown;
}

const VIEWING_TIME_DEFINITION =
  "How viewing time is calculated: seconds accrue only while the investor’s viewer tab is visible and recently active. The figure is an estimate, not a stopwatch reading.";

const SESSION_DEFINITION =
  "Session tracking definitions: a view starts when the first slide renders. Fetching the file does not count. Unique visitors are distinct first-party browser IDs for this deck version, so a new browser can look like a new visitor.";

const VIEWS_DEFINITION =
  "Started viewer sessions. A file fetch alone is not a view.";

const COMPLETION_DEFINITION =
  "Percent of sessions that viewed every slide. Blank when this PDF has no known page count. Zero means sessions started and none finished the deck.";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asFinite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asCount(value: unknown): number {
  const parsed = asFinite(value);
  if (parsed == null || parsed < 0) return 0;
  return parsed;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remain = total % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return remain > 0 ? `${minutes}m ${remain}s` : `${minutes}m`;
  return `${remain}s`;
}

export function formatCompletionRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  const rounded = Math.round(rate * 10) / 10;
  return `${rounded}%`;
}

export function formatRelativeTime(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "—";
  const then = Date.parse(value);
  if (!Number.isFinite(then)) return "—";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "1 min ago" : `${minutes} mins ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? "1 day ago" : `${days} days ago`;
  return new Date(then).toLocaleDateString();
}

export function deckVersionLabel(fileName: string, version: number, isActive: boolean): string {
  const stem = fileName.replace(/\.[^.]+$/i, "").trim() || "Pitch deck";
  const safeVersion = Number.isFinite(version) && version > 0 ? Math.round(version) : 1;
  const withVersion = /\bv\d+\b/i.test(stem) ? stem : `${stem} v${safeVersion}`;
  return isActive ? `${withVersion} (Active)` : withVersion;
}

export function deckVersionNumber(decks: Array<{ id: string; uploadedAt: string }>, deckId: string): number {
  const ordered = [...decks].sort((a, b) => {
    const delta = Date.parse(a.uploadedAt) - Date.parse(b.uploadedAt);
    if (Number.isFinite(delta) && delta !== 0) return delta;
    return a.id.localeCompare(b.id);
  });
  const index = ordered.findIndex((deck) => deck.id === deckId);
  return index >= 0 ? index + 1 : 1;
}

export function shareLinkUrl(
  origin: string,
  companySlug: string | null | undefined,
  presentationSlug: string | null | undefined,
  token: string | null | undefined,
): string {
  const base = origin.replace(/\/$/, "");
  if (companySlug && presentationSlug) return `${base}/share/${companySlug}/${presentationSlug}`;
  if (token) return `${base}/share/${token}`;
  return "";
}

export function slidesProgressLabel(viewed: number | null, total: number | null): string {
  if (total != null && total > 0) return `${viewed ?? 0} / ${total} slides`;
  if (viewed != null && viewed > 0) return `${viewed} slides`;
  return "—";
}

function genericLinkName(value: string): boolean {
  return /^(shared deck|general link|general)$/i.test(value) || /(?:^| · )pitch deck$/i.test(value);
}

function investorName(link: RawLink): string {
  const person = asText(link.intendedInvestorName);
  return person && !/^unassigned$/i.test(person) ? person : "";
}

function customLinkLabel(link: RawLink): string {
  const linkName = asText(link.name);
  if (!linkName || genericLinkName(linkName)) return "";
  return linkName;
}

function recipientLabel(link: RawLink): string {
  const firm = asText(link.intendedInvestorFirm);
  const person = investorName(link);
  if (firm && person && firm.toLowerCase() !== person.toLowerCase()) return `${person} · ${firm}`;
  return firm || person || customLinkLabel(link) || "General Link";
}

function isFirmLink(link: RawLink): boolean {
  return Boolean(asText(link.intendedInvestorFirm) || investorName(link) || customLinkLabel(link));
}

function linkStatus(link: RawLink, now: number): LinkActivityRow["status"] {
  if (asText(link.revokedAt)) return "revoked";
  const expires = asText(link.expiresAt);
  const expiresAt = expires ? Date.parse(expires) : NaN;
  if (Number.isFinite(expiresAt) && expiresAt <= now) return "expired";
  return "active";
}

function slideTitle(slide: RawSlide): string | null {
  const title = asText(slide.title);
  const category = asText(slide.category);
  return title || category || null;
}

function diligenceSignal(link: RawLink, slideCount: number | null, maxSlide: number): DiligenceSignal | null {
  const visits = asCount(link.totalVisits);
  if (visits <= 0) return null;
  const average = asCount(link.viewingSecondsEstimate) / visits;
  const completion = asFinite(link.completionRate);
  const short = average < 30;
  const deckHasEarlyExit = slideCount == null || slideCount >= 3;
  const finished = completion != null && completion >= 100;
  const leftEarly = !finished && maxSlide < 3 && deckHasEarlyExit;
  if (short || leftEarly) return "quick_dropoff";
  if (finished && average > 240) return "high_conviction";
  if (isFirmLink(link) && asCount(link.uniqueViewers) > 2) return "likely_forwarded";
  return null;
}

function normalizeQuestions(value: unknown): RawQuestion[] {
  return asArray(value).map((item) => (asRecord(item) ?? {}) as RawQuestion);
}

export function buildDeckAnalyticsDashboard(
  payload: unknown,
  urlsByLinkId: Record<string, string> = {},
  now = Date.now(),
): DeckAnalyticsDashboard {
  const root = asRecord(payload);
  const deck = asRecord(root?.deck);
  const totals = asRecord(root?.totals);
  if (!root || !deck || !totals) throw new Error("Deck analytics are unavailable.");

  const definitions = asRecord(root.definitions);
  const slideCountRaw = asFinite(deck.slideCount);
  const slideCount = slideCountRaw != null && slideCountRaw > 0 ? Math.round(slideCountRaw) : null;
  const rawLinks = asArray(root.links).map((item) => (asRecord(item) ?? {}) as RawLink);
  const rawQuestions = normalizeQuestions(root.questions);

  const slides = buildSlides(rawLinks, slideCount);
  const questions = rawQuestions.flatMap((question, index) => {
    const body = asText(question.body) || asText(question.question);
    const slideNumber = asFinite(question.slideNumber);
    if (!body || slideNumber == null || slideNumber < 1) return [];
    const linkId = asText(question.linkId) || asText(question.shareId) || null;
    const createdAt = asText(question.createdAt) || asText(question.timestamp) || new Date(now).toISOString();
    return [{
      id: asText(question.id) || `${createdAt}-${Math.round(slideNumber)}-${index}`,
      slideNumber: Math.round(slideNumber),
      body,
      recipientLabel: asText(question.recipientLabel) || "General Link",
      createdAt,
      viewerEmail: asText(question.viewerEmail) || null,
      resolved: question.resolved === true,
      linkId,
    } satisfies SlideQuestionItem];
  });

  const links = rawLinks.map((link, index) => {
    const id = asText(link.id) || `link-${index}`;
    const engagement = asArray(link.slideEngagement).map((item) => (asRecord(item) ?? {}) as RawSlide);
    const maxSlide = engagement.reduce((max, slide) => {
      const slideNumber = asFinite(slide.slideNumber);
      return slideNumber != null && asCount(slide.viewers) > 0 && slideNumber > max ? slideNumber : max;
    }, 0);
    const visits = asCount(link.totalVisits);
    const completion = asFinite(link.completionRate);
    const slidesViewed = completion != null && completion >= 100 && slideCount
      ? slideCount
      : maxSlide > 0 ? Math.round(maxSlide) : visits > 0 ? 0 : null;
    const fromQuestions = questions.filter((question) => question.linkId === id).length;
    const reportedQuestions = asFinite(link.questionCount);
    return {
      id,
      recipientLabel: recipientLabel(link),
      url: urlsByLinkId[id] ?? "",
      views: visits,
      averageSeconds: visits > 0 ? asCount(link.viewingSecondsEstimate) / visits : null,
      slidesViewed,
      slideCount,
      questions: reportedQuestions != null ? Math.max(0, Math.round(reportedQuestions)) : fromQuestions,
      lastActiveAt: asText(link.lastActivityAt) || null,
      signal: diligenceSignal(link, slideCount, maxSlide),
      status: linkStatus(link, now),
    } satisfies LinkActivityRow;
  }).sort((a, b) => {
    const left = a.lastActiveAt ? Date.parse(a.lastActiveAt) : 0;
    const right = b.lastActiveAt ? Date.parse(b.lastActiveAt) : 0;
    return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
  });

  const labels = new Map(links.map((link) => [link.id, link.recipientLabel]));
  const labeledQuestions = questions
    .map((question) => ({
      ...question,
      recipientLabel: (question.linkId && labels.get(question.linkId)) || question.recipientLabel,
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const totalViews = asCount(totals.totalVisits);
  const reportedQuestions = asFinite(totals.inboundQuestions);
  const questionTotal = reportedQuestions != null
    ? Math.max(0, Math.round(reportedQuestions))
    : labeledQuestions.length || links.reduce((sum, link) => sum + link.questions, 0);

  return {
    summary: {
      totalViews,
      uniqueVisitors: asCount(totals.uniqueViewers),
      averageViewingSeconds: totalViews > 0 ? asCount(totals.viewingSecondsEstimate) / totalViews : null,
      completionRate: asFinite(totals.completionRate),
      inboundQuestions: questionTotal,
    },
    slides,
    links,
    questions: labeledQuestions,
    definitions: {
      views: asText(definitions?.totalVisits) || VIEWS_DEFINITION,
      viewingTime: asText(definitions?.viewingSecondsEstimate) || VIEWING_TIME_DEFINITION,
      sessions: SESSION_DEFINITION,
      completion: asText(definitions?.completionRate) || COMPLETION_DEFINITION,
    },
  };
}

function buildSlides(links: RawLink[], slideCount: number | null): SlideDwellMetric[] {
  const bySlide = new Map<number, { viewers: number; seconds: number; title: string | null }>();
  for (const link of links) {
    for (const item of asArray(link.slideEngagement)) {
      const slide = (asRecord(item) ?? {}) as RawSlide;
      const slideNumber = asFinite(slide.slideNumber);
      if (slideNumber == null || slideNumber < 1 || slideNumber > 500) continue;
      const key = Math.round(slideNumber);
      const current = bySlide.get(key) ?? { viewers: 0, seconds: 0, title: null };
      current.viewers += asCount(slide.viewers);
      current.seconds += asCount(slide.activeSecondsEstimate);
      current.title = current.title || slideTitle(slide);
      bySlide.set(key, current);
    }
  }

  const highestSeen = bySlide.size ? Math.max(...bySlide.keys()) : 0;
  const total = Math.max(slideCount ?? 0, highestSeen);
  if (total < 1) return [];

  const rows: SlideDwellMetric[] = [];
  for (let slideNumber = 1; slideNumber <= total; slideNumber += 1) {
    const stat = bySlide.get(slideNumber) ?? { viewers: 0, seconds: 0, title: null };
    const next = bySlide.get(slideNumber + 1);
    const isLast = slideNumber === total;
    const dropOff = !isLast && stat.viewers > 0
      ? Math.max(0, (stat.viewers - (next?.viewers ?? 0)) / stat.viewers) * 100
      : null;
    rows.push({
      slideNumber,
      title: stat.title,
      viewCount: stat.viewers,
      averageSeconds: stat.viewers > 0 ? stat.seconds / stat.viewers : 0,
      dropOffRate: dropOff == null ? null : Math.round(dropOff * 10) / 10,
      isHotspot: false,
      isHighDropOff: dropOff != null && dropOff > 40,
    });
  }

  const hotspots = [...rows]
    .filter((slide) => slide.averageSeconds > 0)
    .sort((a, b) => b.averageSeconds - a.averageSeconds || a.slideNumber - b.slideNumber)
    .slice(0, 2)
    .map((slide) => slide.slideNumber);
  const hotspotSet = new Set(hotspots);
  return rows.map((slide) => ({ ...slide, isHotspot: hotspotSet.has(slide.slideNumber) }));
}
