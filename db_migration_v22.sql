-- ============================================================
-- HMS — Migration v22
-- Corrige RLS da tabela show_groups para compartilhar grupos
-- entre todos os usuários autenticados (mesmo padrão de songs,
-- cadences, melodic_phrases, harmonic_melodic_studies).
--
-- SEGURO: apenas altera policies. Nenhum dado é modificado.
--
-- Antes: SELECT restrito ao user_id (privado por usuário)
-- Depois: SELECT aberto para todos os autenticados (compartilhado)
--         INSERT/UPDATE/DELETE: somente o criador
-- ============================================================

-- Remove a policy única que cobria tudo (FOR ALL) criada na v21
DROP POLICY IF EXISTS "show_groups_own" ON public.show_groups;

-- Leitura: todos os usuários autenticados veem todos os grupos
CREATE POLICY "show_groups_read" ON public.show_groups
    FOR SELECT
    TO authenticated
    USING (TRUE);

-- Inserção: apenas o próprio usuário
CREATE POLICY "show_groups_insert" ON public.show_groups
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Atualização: apenas o criador
CREATE POLICY "show_groups_update" ON public.show_groups
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Exclusão: apenas o criador
CREATE POLICY "show_groups_delete" ON public.show_groups
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());
