export type IncomingDeckShareEvent = {
  eventId?: unknown; type?: unknown; slideNumber?: unknown; activeSeconds?: unknown;
  documentId?: unknown; slideIndex?: unknown; durationSeconds?: unknown; exitAction?: unknown; timestamp?: unknown;
};
export type DeckShareEventRow = {
  event_id: string; session_id: string; share_id: string; event_type: string;
  slide_number: number | null; active_seconds: number; duration_seconds: number | null;
  exit_action: string | null; created_at?: string;
};

const eventTypes = new Set(["session_start", "slide_view", "slide_time", "slide_exit", "session_end"]);
const exitActions = new Set(["next_arrow", "prev_arrow", "keyboard", "top_stepper", "unload"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function prepareDeckShareEventRows(input: IncomingDeckShareEvent[], sessionId: string, shareId: string, maxPage: number, expectedDocumentId?: string) {
  if (!input.length || input.length > 20) return { rows: null, error: "Send between 1 and 20 viewer events." };
  const rows: DeckShareEventRow[] = [];
  for (const item of input) {
    const eventId = typeof item.eventId === "string" && UUID_PATTERN.test(item.eventId) ? item.eventId : "";
    const type = typeof item.type === "string" ? item.type : "";
    const slideNumber = Number(type === "slide_exit" ? item.slideIndex : item.slideNumber);
    const activeSeconds = Number(item.activeSeconds);
    if (!eventId || !eventTypes.has(type)) return { rows: null, error: "A viewer event is invalid." };
    if (["slide_view", "slide_time", "slide_exit"].includes(type) && (!Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > maxPage)) return { rows: null, error: "Slide number is outside this deck." };
    if (type === "slide_time" && (!Number.isInteger(activeSeconds) || activeSeconds < 1 || activeSeconds > 20)) return { rows: null, error: "Slide time must be between 1 and 20 seconds." };
    if (type === "slide_exit") {
      const durationSeconds = Number(item.durationSeconds);
      const timestamp = typeof item.timestamp === "string" ? Date.parse(item.timestamp) : Number.NaN;
      if (typeof item.documentId !== "string" || (expectedDocumentId && item.documentId !== expectedDocumentId)) return { rows: null, error: "The slide analytics document does not match this share." };
      if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 86400) return { rows: null, error: "Slide duration is outside the accepted range." };
      if (!exitActions.has(String(item.exitAction))) return { rows: null, error: "Slide exit action is invalid." };
      if (!Number.isFinite(timestamp) || timestamp < Date.now() - 86_400_000 || timestamp > Date.now() + 60_000) return { rows: null, error: "Slide event timestamp is invalid." };
      rows.push({ event_id: eventId, session_id: sessionId, share_id: shareId, event_type: type, slide_number: slideNumber, active_seconds: 0, duration_seconds: Number(durationSeconds.toFixed(3)), exit_action: String(item.exitAction), created_at: new Date(timestamp).toISOString() });
      continue;
    }
    rows.push({ event_id: eventId, session_id: sessionId, share_id: shareId, event_type: type, slide_number: Number.isInteger(slideNumber) && slideNumber > 0 ? slideNumber : null, active_seconds: type === "slide_time" ? activeSeconds : 0, duration_seconds: null, exit_action: null });
  }
  return { rows, error: null };
}
