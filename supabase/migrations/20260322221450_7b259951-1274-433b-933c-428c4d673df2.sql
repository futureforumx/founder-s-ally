
CREATE TABLE public.community_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  event_date timestamp with time zone NOT NULL,
  location text NOT NULL DEFAULT 'Virtual',
  event_type text NOT NULL DEFAULT 'Meetup',
  sector text,
  stage text,
  max_attendees integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'going',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read events" ON public.community_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create events" ON public.community_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators can update own events" ON public.community_events FOR UPDATE TO authenticated USING (auth.uid() = creator_id);
CREATE POLICY "Creators can delete own events" ON public.community_events FOR DELETE TO authenticated USING (auth.uid() = creator_id);

CREATE POLICY "Anyone can read RSVPs" ON public.event_rsvps FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can RSVP" ON public.event_rsvps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own RSVP" ON public.event_rsvps FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can cancel own RSVP" ON public.event_rsvps FOR DELETE TO authenticated USING (auth.uid() = user_id);
