-- ============================================================
-- HMS — Migration v21
-- Tabela show_groups: persiste agrupamentos visuais de músicas
-- no show grid (antes armazenados apenas no localStorage).
--
-- Estrutura:
--   user_id    → FK para profiles (RLS)
--   setlist_id → NULL significa "todas as músicas" (sem setlist)
--   group_id   → UUID gerado no cliente para identificar o grupo
--   song_ids   → array de UUIDs das músicas do grupo (TEXT[])
-- ============================================================

CREATE TABLE IF NOT EXISTS public.show_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    setlist_id  UUID REFERENCES public.setlists(id) ON DELETE CASCADE,
    group_id    TEXT NOT NULL,
    song_ids    TEXT[] NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, group_id)
);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION public.set_show_groups_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_show_groups_updated_at ON public.show_groups;
CREATE TRIGGER trg_show_groups_updated_at
    BEFORE UPDATE ON public.show_groups
    FOR EACH ROW EXECUTE FUNCTION public.set_show_groups_updated_at();

-- RLS
ALTER TABLE public.show_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "show_groups_own" ON public.show_groups
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Índices
CREATE INDEX IF NOT EXISTS idx_show_groups_user    ON public.show_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_show_groups_setlist ON public.show_groups(setlist_id);
