-- HMS Migration v7 — Melodic Phrases repository
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.melodic_phrases (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    melody      TEXT NOT NULL,
    root        VARCHAR(3) DEFAULT 'C',
    bpm         INTEGER DEFAULT 80,
    created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.melodic_phrases ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read all phrases (shared)
CREATE POLICY "mp_read" ON public.melodic_phrases
    FOR SELECT USING (auth.role() = 'authenticated');

-- Any authenticated user can insert their own phrases
CREATE POLICY "mp_insert" ON public.melodic_phrases
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Only the creator can update
CREATE POLICY "mp_update" ON public.melodic_phrases
    FOR UPDATE USING (auth.uid() = user_id);

-- Only the creator can delete
CREATE POLICY "mp_delete" ON public.melodic_phrases
    FOR DELETE USING (auth.uid() = user_id);
