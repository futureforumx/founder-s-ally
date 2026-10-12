import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, FileText, ExternalLink, ShieldAlert } from "lucide-react";

/**
 * Public deck viewer behind a share token. Opening this page is what records a
 * view against the share, so the founder sees it in Data Room → Overview.
 */

type ShareState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; fileName: string; recipientName: string; signedUrl: string };

export default function DeckSharePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<ShareState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/deck-share-view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, referrer: document.referrer || null }),
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok || !json?.ok) {
          setState({ status: "error", message: json?.error || "This share link could not be opened." });
          return;
        }
        setState({
          status: "ready",
          fileName: json.fileName,
          recipientName: json.recipientName,
          signedUrl: json.signedUrl,
        });
      } catch {
        if (!cancelled) {
          setState({ status: "error", message: "Something went wrong opening this link." });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-black font-spaceGrotesk text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <img src="/brand/vekta-wordmark.png" alt="Vekta" className="h-6 w-auto object-contain" />
        {state.status === "ready" && (
          <a
            href={state.signedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open PDF
          </a>
        )}
      </header>

      {state.status === "loading" && (
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm text-white/60">Opening shared deck…</p>
        </div>
      )}

      {state.status === "error" && (
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/5">
            <ShieldAlert className="h-5 w-5 text-white/50" />
          </div>
          <p className="text-sm font-medium">Link unavailable</p>
          <p className="max-w-sm text-xs text-white/50">{state.message}</p>
        </div>
      )}

      {state.status === "ready" && (
        <main className="mx-auto w-full max-w-5xl px-6 py-8">
          <div className="mb-5 flex items-center gap-2.5">
            <FileText className="h-4 w-4 text-primary" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">{state.fileName}</h1>
              <p className="text-xs text-white/50">Shared with {state.recipientName}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <iframe
              src={state.signedUrl}
              title={state.fileName}
              className="h-[75vh] w-full"
            />
          </div>
        </main>
      )}
    </div>
  );
}
