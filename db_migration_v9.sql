-- HMS - Migration v9
-- Table: harmonic_melodic_studies
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.harmonic_melodic_studies (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title         TEXT        NOT NULL,
    root          TEXT        NOT NULL DEFAULT 'C',
    is_minor      BOOLEAN     NOT NULL DEFAULT FALSE,
    harmony       TEXT        NOT NULL,
    bpm           INTEGER     NOT NULL DEFAULT 80,
    half_measures JSONB       NOT NULL DEFAULT '[]',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.harmonic_melodic_studies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all harmonic studies"
    ON public.harmonic_melodic_studies FOR SELECT
    USING (TRUE);

CREATE POLICY "Users can insert their own harmonic studies"
    ON public.harmonic_melodic_studies FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own harmonic studies"
    ON public.harmonic_melodic_studies FOR DELETE
    USING (auth.uid() = user_id);
