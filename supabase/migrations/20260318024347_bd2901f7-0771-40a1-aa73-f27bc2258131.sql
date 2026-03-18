
INSERT INTO storage.buckets (id, name, public) VALUES ('company-logos', 'company-logos', true);

CREATE POLICY "Authenticated users can upload logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "Anyone can view logos"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'company-logos');

CREATE POLICY "Users can update own logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'company-logos');

CREATE POLICY "Users can delete own logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'company-logos');
