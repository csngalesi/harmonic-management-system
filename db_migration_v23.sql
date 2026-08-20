-- ============================================================
-- HMS — Migration v23
-- show_groups totalmente colaborativo: qualquer usuário
-- autenticado pode criar, editar e remover qualquer grupo.
-- Mesmo padrão das demais tabelas colaborativas do HMS.
--
-- SEGURO: apenas altera policies. Nenhum dado é modificado.
-- ============================================================

-- Remove todas as policies da v21/v22
DROP POLICY IF EXISTS "show_groups_own"    ON public.show_groups;
DROP POLICY IF EXISTS "show_groups_read"   ON public.show_groups;
DROP POLICY IF EXISTS "show_groups_insert" ON public.show_groups;
DROP POLICY IF EXISTS "show_groups_update" ON public.show_groups;
DROP POLICY IF EXISTS "show_groups_delete" ON public.show_groups;

-- Policy única: acesso total para qualquer usuário autenticado
CREATE POLICY "show_groups_collaborative" ON public.show_groups
    FOR ALL
    TO authenticated
    USING (TRUE)
    WITH CHECK (TRUE);
