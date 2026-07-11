-- ============================================================
-- HMS — Migration v18
-- Tabela: guitar_samples
-- Bucket: guitar-samples  (criar manualmente no Supabase Dashboard
--         como bucket PÚBLICO antes de rodar esta migration)
-- ============================================================

-- 1. Tabela principal
CREATE TABLE IF NOT EXISTS public.guitar_samples (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    chord_root   TEXT        NOT NULL,   -- 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
    chord_quality TEXT       NOT NULL,   -- '' | 'm' | '7' | 'm7' | 'dim'
    instrument   TEXT        NOT NULL DEFAULT 'guitar',  -- 'guitar' | 'cavaco'
    storage_path TEXT        NOT NULL,   -- '{user_id}/{instrument}/{root}{quality}.wav'
    duration_ms  INTEGER,               -- duração do sample processado
    created_at   TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT guitar_samples_unique_slot
        UNIQUE (user_id, chord_root, chord_quality, instrument)
);

-- 2. Índice para busca rápida por user + instrument
CREATE INDEX IF NOT EXISTS idx_guitar_samples_user_instrument
    ON public.guitar_samples (user_id, instrument);

-- 3. Row Level Security
ALTER TABLE public.guitar_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guitar_samples: users read own"
    ON public.guitar_samples FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "guitar_samples: users insert own"
    ON public.guitar_samples FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "guitar_samples: users update own"
    ON public.guitar_samples FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "guitar_samples: users delete own"
    ON public.guitar_samples FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================
-- STORAGE (executar no Supabase Dashboard ou via API)
-- ============================================================
-- 1. Criar bucket "guitar-samples" como PÚBLICO
-- 2. Política de storage para upload:
--    INSERT: auth.uid()::text = (storage.foldername(name))[1]
-- 3. Política de storage para leitura pública:
--    SELECT: true  (bucket público)
-- 4. Política de storage para deleção:
--    DELETE: auth.uid()::text = (storage.foldername(name))[1]
-- ============================================================
