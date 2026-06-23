-- ============================================================
-- HMS Migration v14 — RLS colaborativo para songs
-- Permite que qualquer usuário autenticado leia e edite músicas.
-- (Antes, apenas o criador podia editar — bloqueava colaboração.)
-- Execute no SQL Editor do dashboard do Supabase.
-- ============================================================

-- Remove política restritiva anterior
DROP POLICY IF EXISTS "songs_own" ON public.songs;

-- Nova política: leitura e escrita para qualquer usuário autenticado
-- INSERT ainda registra user_id = auth.uid() (rastreabilidade)
CREATE POLICY "songs_authenticated_read" ON public.songs
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "songs_authenticated_write" ON public.songs
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "songs_authenticated_update" ON public.songs
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "songs_authenticated_delete" ON public.songs
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());  -- só o criador pode deletar
