-- HMS Migration v8 — add scale_key to melodic_phrases
-- Run in Supabase SQL Editor

ALTER TABLE public.melodic_phrases
    ADD COLUMN IF NOT EXISTS scale_key VARCHAR(20) DEFAULT 'major';
