-- 1. Create the Mentor_Profiles table
CREATE TABLE IF NOT EXISTS public.mentor_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentor_email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    subtitle TEXT,
    intro TEXT,
    languages TEXT,
    photo_url TEXT,
    book_slot_enabled BOOLEAN DEFAULT false,
    book_slot_url TEXT,
    is_enabled BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    centre_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Enable RLS
ALTER TABLE public.mentor_profiles ENABLE ROW LEVEL SECURITY;

-- 3. Add Permissions Policies
DROP POLICY IF EXISTS "Anyone can view mentor profiles" ON public.mentor_profiles;
CREATE POLICY "Anyone can view mentor profiles" ON public.mentor_profiles
FOR SELECT TO public
USING (true);

DROP POLICY IF EXISTS "Admins can insert mentor profiles" ON public.mentor_profiles;
CREATE POLICY "Admins can insert mentor profiles" ON public.mentor_profiles
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public."Access" a
        WHERE a.email_id = auth.jwt() ->> 'email'
        AND a.role IN ('Super admin', 'Admin', 'Academics')
    )
);

DROP POLICY IF EXISTS "Admins can update mentor profiles" ON public.mentor_profiles;
CREATE POLICY "Admins can update mentor profiles" ON public.mentor_profiles
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public."Access" a
        WHERE a.email_id = auth.jwt() ->> 'email'
        AND a.role IN ('Super admin', 'Admin', 'Academics')
    )
);

-- 4. Storage Bucket for Photos (Safe to run multiple times)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('mentor_photos', 'mentor_photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view mentor photos" ON storage.objects;
CREATE POLICY "Public can view mentor photos" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'mentor_photos');

DROP POLICY IF EXISTS "Authenticated can upload mentor photos" ON storage.objects;
CREATE POLICY "Authenticated can upload mentor photos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'mentor_photos');

DROP POLICY IF EXISTS "Authenticated can update mentor photos" ON storage.objects;
CREATE POLICY "Authenticated can update mentor photos" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'mentor_photos');
