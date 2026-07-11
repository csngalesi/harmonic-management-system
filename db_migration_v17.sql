-- ============================================================
-- HMS Migration v17 — Repositório de Cadências: acesso colaborativo
-- Remove restrições de owner nas políticas UPDATE e DELETE,
-- permitindo que qualquer usuário autenticado edite/delete qualquer cadência.
-- Execute no SQL Editor do dashboard do Supabase.
-- ============================================================

-- Recria políticas UPDATE e DELETE sem restrição de owner
DROP POLICY IF EXISTS "cadence_phrases_update" ON public.cadence_phrases;
DROP POLICY IF EXISTS "cadence_phrases_delete" ON public.cadence_phrases;

CREATE POLICY "cadence_phrases_update" ON public.cadence_phrases
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "cadence_phrases_delete" ON public.cadence_phrases
    FOR DELETE TO authenticated
    USING (true);
