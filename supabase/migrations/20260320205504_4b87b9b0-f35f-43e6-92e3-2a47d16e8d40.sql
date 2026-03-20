
-- Create pitch deck version table
CREATE TABLE public.company_pitch_decks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  file_size_bytes BIGINT,
  slide_count INTEGER
);

-- Enable RLS
ALTER TABLE public.company_pitch_decks ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own decks" ON public.company_pitch_decks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own decks" ON public.company_pitch_decks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own decks" ON public.company_pitch_decks FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own decks" ON public.company_pitch_decks FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Function to deactivate all decks before setting new active
CREATE OR REPLACE FUNCTION public.deactivate_other_decks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.company_pitch_decks
    SET is_active = false
    WHERE user_id = NEW.user_id AND id != NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deactivate_other_decks
BEFORE INSERT OR UPDATE ON public.company_pitch_decks
FOR EACH ROW
EXECUTE FUNCTION public.deactivate_other_decks();
