-- Create a new bucket for mentor photos if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('mentor_photos', 'mentor_photos', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for public reading
DROP POLICY IF EXISTS "Public can view mentor photos" ON storage.objects;
CREATE POLICY "Public can view mentor photos" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'mentor_photos');

-- Policies for authenticated upload
DROP POLICY IF EXISTS "Authenticated can upload mentor photos" ON storage.objects;
CREATE POLICY "Authenticated can upload mentor photos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'mentor_photos');

-- Policies for authenticated deletion/updates
DROP POLICY IF EXISTS "Authenticated can update mentor photos" ON storage.objects;
CREATE POLICY "Authenticated can update mentor photos" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'mentor_photos');
