-- ============================================================
-- HMS Migration v16 — Repositório de Cadências
-- Cria a tabela cadence_phrases com políticas RLS compartilhadas.
-- Execute no SQL Editor do dashboard do Supabase.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cadence_phrases (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    harmony     TEXT NOT NULL DEFAULT '',
    root        TEXT NOT NULL DEFAULT 'C',
    is_minor    BOOLEAN NOT NULL DEFAULT false,
    bpm         INTEGER NOT NULL DEFAULT 60,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cadence_phrases ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler (repositório compartilhado)
CREATE POLICY "cadence_phrases_select" ON public.cadence_phrases
    FOR SELECT TO authenticated
    USING (true);

-- Cada usuário só insere com seu próprio user_id
CREATE POLICY "cadence_phrases_insert" ON public.cadence_phrases
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Cada usuário só edita as próprias cadências
CREATE POLICY "cadence_phrases_update" ON public.cadence_phrases
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Cada usuário só deleta as próprias cadências
CREATE POLICY "cadence_phrases_delete" ON public.cadence_phrases
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_cadence_phrases_user ON public.cadence_phrases(user_id);
CREATE INDEX IF NOT EXISTS idx_cadence_phrases_created ON public.cadence_phrases(created_at DESC);
