
DROP POLICY "Authenticated users can upload logos" ON storage.objects;

CREATE POLICY "Anyone can upload logos"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'company-logos');
