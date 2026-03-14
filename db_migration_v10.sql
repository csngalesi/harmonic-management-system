-- HMS — Migration v10
-- Adiciona flag de alerta global nas músicas
-- Execute no SQL Editor do Supabase

ALTER TABLE public.songs
    ADD COLUMN IF NOT EXISTS is_alert BOOLEAN NOT NULL DEFAULT false;
