-- HMS Migration v13
-- Replace boolean is_alert with 3-state status_flag
-- Run in Supabase SQL Editor

ALTER TABLE public.songs
    ADD COLUMN IF NOT EXISTS status_flag SMALLINT NOT NULL DEFAULT 0;

-- Migrate existing alerts: is_alert=true → status_flag=3 (red)
UPDATE public.songs SET status_flag = 3 WHERE is_alert = true;
