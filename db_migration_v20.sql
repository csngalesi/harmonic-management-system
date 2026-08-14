-- ============================================================
-- HMS — Migration v20
-- Converte coluna `starred` (boolean) em `stage` (text).
-- stage: NULL = sem estágio | 'N' | 'L' | 'B'
-- ============================================================

-- 1. Adiciona a nova coluna stage
ALTER TABLE public.songs
    ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT NULL
        CHECK (stage IS NULL OR stage IN ('N', 'L', 'B'));

-- 2. Migra dados existentes: starred = true → stage = 'N'
UPDATE public.songs
    SET stage = 'N'
    WHERE starred = TRUE AND stage IS NULL;

-- 3. Remove a coluna antiga
ALTER TABLE public.songs
    DROP COLUMN IF EXISTS starred;
