-- Deck sharing + view tracking: a founder shares a pitch deck with an investor and
-- we record every time that link is opened. Powers Data Room → Overview → Recent Activity.
--
-- Keyed by Clerk user id (auth.jwt()->>'sub'), mirroring company_pitch_decks /
-- company_metrics so it works before any company workspace is linked.

CREATE TABLE public.deck_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  deck_id UUID NOT NULL REFERENCES public.company_pitch_decks(id) ON DELETE CASCADE,

  -- Unguessable public path segment for /share/:token.
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),

  -- Who it went to, as the founder labelled them.
  recipient_name TEXT NOT NULL,
  recipient_firm TEXT,
  recipient_email TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_deck_shares_user ON public.deck_shares (user_id, created_at DESC);
CREATE INDEX idx_deck_shares_deck ON public.deck_shares (deck_id);

-- Append-only log. One row per open of a share link.
CREATE TABLE public.deck_share_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id UUID NOT NULL REFERENCES public.deck_shares(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  -- Coarse viewer context only. No raw IP is stored; the edge function passes a
  -- salted hash so repeat opens can be grouped without holding personal data.
  viewer_hash TEXT,
  user_agent TEXT,
  referrer TEXT
);

CREATE INDEX idx_deck_share_views_share ON public.deck_share_views (share_id, viewed_at DESC);

ALTER TABLE public.deck_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_share_views ENABLE ROW LEVEL SECURITY;

-- Founders manage their own shares.
CREATE POLICY "Users can view own deck shares" ON public.deck_shares
  FOR SELECT TO authenticated USING ((auth.jwt() ->> 'sub') = user_id);
CREATE POLICY "Users can insert own deck shares" ON public.deck_shares
  FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'sub') = user_id);
CREATE POLICY "Users can update own deck shares" ON public.deck_shares
  FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'sub') = user_id);
CREATE POLICY "Users can delete own deck shares" ON public.deck_shares
  FOR DELETE TO authenticated USING ((auth.jwt() ->> 'sub') = user_id);

-- Views are readable only by the founder who owns the share. There is deliberately
-- no INSERT policy: writes come from the share-view edge function using the service
-- role, so an anonymous viewer can never forge or enumerate view rows.
CREATE POLICY "Users can view own share views" ON public.deck_share_views
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.deck_shares s
      WHERE s.id = deck_share_views.share_id
        AND s.user_id = (auth.jwt() ->> 'sub')
    )
  );
