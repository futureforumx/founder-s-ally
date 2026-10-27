-- Logical fundraising documents and immutable versions. Existing deck rows are
-- migrated one-to-one because the legacy schema has no document identity.
CREATE TABLE public.fundraising_file_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  category text NOT NULL CHECK (category IN ('Pitch Deck', 'One Pager', 'Demo')),
  current_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fundraising_file_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.fundraising_file_documents(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  source_kind text NOT NULL CHECK (source_kind IN ('upload', 'video_link')),
  storage_ref text,
  external_url text,
  original_filename text,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  change_note text,
  UNIQUE (document_id, version_number),
  CHECK (
    (source_kind = 'upload' AND storage_ref IS NOT NULL AND external_url IS NULL)
    OR (source_kind = 'video_link' AND external_url IS NOT NULL AND storage_ref IS NULL AND size_bytes IS NULL)
  ),
  CHECK (external_url IS NULL OR external_url ~ '^https://')
);

ALTER TABLE public.fundraising_file_documents
  ADD CONSTRAINT fundraising_file_documents_current_version_fkey
  FOREIGN KEY (current_version_id) REFERENCES public.fundraising_file_versions(id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION public.validate_fundraising_file_current_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.current_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fundraising_file_versions v
    WHERE v.id = NEW.current_version_id
      AND v.document_id = NEW.id
      AND v.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Current version must belong to the same fundraising document';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_fundraising_file_current_version
  BEFORE INSERT OR UPDATE OF current_version_id, user_id ON public.fundraising_file_documents
  FOR EACH ROW EXECUTE FUNCTION public.validate_fundraising_file_current_version();

CREATE INDEX fundraising_file_documents_owner_updated_idx
  ON public.fundraising_file_documents (user_id, updated_at DESC);
CREATE INDEX fundraising_file_versions_document_idx
  ON public.fundraising_file_versions (document_id, version_number DESC);

ALTER TABLE public.fundraising_file_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fundraising_file_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own fundraising files" ON public.fundraising_file_documents
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "Users manage own fundraising file versions" ON public.fundraising_file_versions
  FOR ALL TO authenticated
  USING (
    (auth.jwt() ->> 'sub') = user_id
    AND EXISTS (
      SELECT 1 FROM public.fundraising_file_documents d
      WHERE d.id = document_id AND d.user_id = (auth.jwt() ->> 'sub')
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'sub') = user_id
    AND EXISTS (
      SELECT 1 FROM public.fundraising_file_documents d
      WHERE d.id = document_id AND d.user_id = (auth.jwt() ->> 'sub')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fundraising_file_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fundraising_file_versions TO authenticated;

-- The legacy table is explicitly a pitch-deck version table and enforces one
-- active upload per user. Preserve that version sequence as one document per
-- user; use the active filename only as the initial display-name suggestion.
ALTER TABLE public.company_pitch_decks
  ADD COLUMN IF NOT EXISTS fundraising_document_id uuid
  REFERENCES public.fundraising_file_documents(id) ON DELETE SET NULL;

DO $$
DECLARE
  legacy record;
  document_id uuid;
  active_file_name text;
  current_version uuid;
BEGIN
  FOR legacy IN
    SELECT user_id, min(uploaded_at) AS first_uploaded_at, max(uploaded_at) AS last_uploaded_at
    FROM public.company_pitch_decks
    WHERE fundraising_document_id IS NULL
    GROUP BY user_id
  LOOP
    SELECT file_name INTO active_file_name
    FROM public.company_pitch_decks
    WHERE user_id = legacy.user_id
    ORDER BY is_active DESC, uploaded_at DESC, id DESC
    LIMIT 1;

    INSERT INTO public.fundraising_file_documents (user_id, display_name, category, created_at, updated_at)
    VALUES (
      legacy.user_id,
      COALESCE(NULLIF(regexp_replace(active_file_name, '\.[^.]+$', ''), ''), 'Pitch Deck'),
      'Pitch Deck', legacy.first_uploaded_at, legacy.last_uploaded_at
    ) RETURNING id INTO document_id;

    INSERT INTO public.fundraising_file_versions (
      id, document_id, user_id, version_number, source_kind, storage_ref,
      original_filename, mime_type, size_bytes, uploaded_by, created_at
    )
    SELECT
      deck.id, document_id, deck.user_id,
      row_number() OVER (ORDER BY deck.uploaded_at, deck.id)::integer,
      'upload', deck.file_url, deck.file_name,
      CASE WHEN lower(deck.file_name) LIKE '%.pdf' THEN 'application/pdf'
           WHEN lower(deck.file_name) LIKE '%.txt' THEN 'text/plain'
           WHEN lower(deck.file_name) LIKE '%.md' THEN 'text/markdown'
           WHEN lower(deck.file_name) LIKE '%.ppt' THEN 'application/vnd.ms-powerpoint'
           WHEN lower(deck.file_name) LIKE '%.pptx' THEN 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
           WHEN lower(deck.file_name) LIKE '%.doc' THEN 'application/msword'
           WHEN lower(deck.file_name) LIKE '%.docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
           ELSE 'application/octet-stream' END,
      deck.file_size_bytes, deck.user_id, deck.uploaded_at
    FROM public.company_pitch_decks deck
    WHERE deck.user_id = legacy.user_id AND deck.fundraising_document_id IS NULL;

    SELECT deck.id INTO current_version
    FROM public.company_pitch_decks deck
    WHERE deck.user_id = legacy.user_id
    ORDER BY deck.is_active DESC, deck.uploaded_at DESC, deck.id DESC
    LIMIT 1;

    UPDATE public.fundraising_file_documents
    SET current_version_id = current_version
    WHERE id = document_id;

    UPDATE public.company_pitch_decks
    SET fundraising_document_id = document_id
    WHERE user_id = legacy.user_id AND fundraising_document_id IS NULL;
  END LOOP;
END;
$$;

-- Serialize version allocation per logical document. Uploads are stored first;
-- this RPC publishes the immutable record and current pointer only afterward.
CREATE OR REPLACE FUNCTION public.add_fundraising_file_version(
  p_document_id uuid,
  p_source_kind text,
  p_storage_ref text DEFAULT NULL,
  p_external_url text DEFAULT NULL,
  p_original_filename text DEFAULT NULL,
  p_mime_type text DEFAULT NULL,
  p_size_bytes bigint DEFAULT NULL,
  p_change_note text DEFAULT NULL
) RETURNS public.fundraising_file_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  document_row public.fundraising_file_documents;
  inserted_version public.fundraising_file_versions;
  next_number integer;
  actor text := auth.jwt() ->> 'sub';
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO document_row
  FROM public.fundraising_file_documents
  WHERE id = p_document_id AND user_id = actor
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found or access denied'; END IF;

  IF p_source_kind = 'upload' THEN
    IF p_storage_ref IS NULL OR p_external_url IS NOT NULL THEN RAISE EXCEPTION 'Invalid upload source'; END IF;
    IF p_storage_ref NOT LIKE ('r2://pitch-decks/' || actor || '/%') THEN RAISE EXCEPTION 'Invalid private storage reference'; END IF;
    IF document_row.category = 'Demo' AND (COALESCE(p_mime_type, '') <> 'video/mp4' OR lower(COALESCE(p_original_filename, '')) NOT LIKE '%.mp4') THEN
      RAISE EXCEPTION 'Demo uploads must be MP4 files';
    ELSIF document_row.category <> 'Demo' AND lower(COALESCE(p_original_filename, '')) !~ '\.(pdf|ppt|pptx|doc|docx|txt|md)$' THEN
      RAISE EXCEPTION 'Investor material must be PDF, PowerPoint, Word, TXT, or MD';
    END IF;
  ELSIF p_source_kind = 'video_link' THEN
    IF document_row.category <> 'Demo' OR p_external_url !~ '^https://' OR p_storage_ref IS NOT NULL OR p_size_bytes IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid video link';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid source kind';
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_number
  FROM public.fundraising_file_versions WHERE document_id = p_document_id;

  INSERT INTO public.fundraising_file_versions (
    document_id, user_id, version_number, source_kind, storage_ref,
    external_url, original_filename, mime_type, size_bytes, uploaded_by, change_note
  ) VALUES (
    p_document_id, actor, next_number, p_source_kind, p_storage_ref,
    p_external_url, p_original_filename, p_mime_type, p_size_bytes, actor, NULLIF(btrim(p_change_note), '')
  ) RETURNING * INTO inserted_version;

  UPDATE public.fundraising_file_documents
  SET current_version_id = inserted_version.id, updated_at = now()
  WHERE id = p_document_id;

  -- Keep the established pitch-deck consumer in sync (assessment/share flows).
  IF document_row.category = 'Pitch Deck' AND p_source_kind = 'upload' THEN
    INSERT INTO public.company_pitch_decks (
      id, user_id, file_name, file_url, is_active, file_size_bytes, fundraising_document_id, uploaded_at
    ) VALUES (
      inserted_version.id, actor, p_original_filename, p_storage_ref, true, p_size_bytes, p_document_id, inserted_version.created_at
    );
  END IF;
  RETURN inserted_version;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_fundraising_file_version(uuid, text, text, text, text, text, bigint, text) TO authenticated;

-- Keep uploads created by older entry points visible in the redesigned Files
-- tab without changing their original storage object or URL.
CREATE OR REPLACE FUNCTION public.mirror_legacy_pitch_deck_to_fundraising_files()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  document_id uuid;
BEGIN
  IF NEW.fundraising_document_id IS NOT NULL THEN RETURN NEW; END IF;
  INSERT INTO public.fundraising_file_documents (user_id, display_name, category, created_at, updated_at)
  VALUES (
    NEW.user_id,
    COALESCE(NULLIF(regexp_replace(NEW.file_name, '\.[^.]+$', ''), ''), 'Pitch Deck'),
    'Pitch Deck', NEW.uploaded_at, NEW.uploaded_at
  ) RETURNING id INTO document_id;
  INSERT INTO public.fundraising_file_versions (
    id, document_id, user_id, version_number, source_kind, storage_ref, original_filename,
    mime_type, size_bytes, uploaded_by, created_at
  ) VALUES (
    NEW.id, document_id, NEW.user_id, 1, 'upload', NEW.file_url, NEW.file_name,
    CASE WHEN lower(NEW.file_name) LIKE '%.pdf' THEN 'application/pdf'
         WHEN lower(NEW.file_name) LIKE '%.txt' THEN 'text/plain'
         WHEN lower(NEW.file_name) LIKE '%.md' THEN 'text/markdown'
         WHEN lower(NEW.file_name) LIKE '%.ppt' THEN 'application/vnd.ms-powerpoint'
         WHEN lower(NEW.file_name) LIKE '%.pptx' THEN 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
         WHEN lower(NEW.file_name) LIKE '%.doc' THEN 'application/msword'
         WHEN lower(NEW.file_name) LIKE '%.docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
         ELSE 'application/octet-stream' END,
    NEW.file_size_bytes, NEW.user_id, NEW.uploaded_at
  );
  UPDATE public.fundraising_file_documents SET current_version_id = NEW.id WHERE id = document_id;
  NEW.fundraising_document_id := document_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mirror_legacy_pitch_deck_to_fundraising_files
  BEFORE INSERT ON public.company_pitch_decks
  FOR EACH ROW
  WHEN (NEW.fundraising_document_id IS NULL)
  EXECUTE FUNCTION public.mirror_legacy_pitch_deck_to_fundraising_files();

CREATE OR REPLACE FUNCTION public.make_fundraising_file_version_current(
  p_document_id uuid,
  p_version_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  actor text := auth.jwt() ->> 'sub';
BEGIN
  PERFORM 1
  FROM public.fundraising_file_versions
  WHERE id = p_version_id AND document_id = p_document_id AND user_id = actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Version not found or access denied'; END IF;
  UPDATE public.fundraising_file_documents
  SET current_version_id = p_version_id, updated_at = now()
  WHERE id = p_document_id AND user_id = actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found or access denied'; END IF;
  UPDATE public.company_pitch_decks
  SET is_active = (id = p_version_id)
  WHERE fundraising_document_id = p_document_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.make_fundraising_file_version_current(uuid, uuid) TO authenticated;
