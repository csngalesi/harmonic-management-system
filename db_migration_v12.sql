-- HMS Migration v12
-- Add audio_url column to songs table
-- Run in Supabase SQL Editor

ALTER TABLE public.songs
    ADD COLUMN IF NOT EXISTS audio_url TEXT;
