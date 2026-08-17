-- ============================================================
-- HMS — Migration v20 (revisado)
-- Adiciona coluna `stage` TEXT (NULL | 'N' | 'L' | 'B')
-- A coluna `starred` já não existe — sem migration de dados.
-- ============================================================

ALTER TABLE public.songs
    ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT NULL
        CHECK (stage IS NULL OR stage IN ('N', 'L', 'B'));
