-- HMS — Migration v11
-- Torna songs, setlists e setlist_songs visíveis para todos os usuários autenticados.
-- Mantém escrita (INSERT/UPDATE/DELETE) restrita ao dono.
-- Execute no SQL Editor do Supabase.

-- ── songs ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "songs_own" ON public.songs;

CREATE POLICY "songs_read_all" ON public.songs
    FOR SELECT TO authenticated
    USING (TRUE);

CREATE POLICY "songs_write_own" ON public.songs
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "songs_update_own" ON public.songs
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "songs_delete_own" ON public.songs
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- ── setlists ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "setlists_own" ON public.setlists;

CREATE POLICY "setlists_read_all" ON public.setlists
    FOR SELECT TO authenticated
    USING (TRUE);

CREATE POLICY "setlists_write_own" ON public.setlists
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "setlists_update_own" ON public.setlists
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "setlists_delete_own" ON public.setlists
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- ── setlist_songs ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "setlist_songs_own" ON public.setlist_songs;

CREATE POLICY "setlist_songs_read_all" ON public.setlist_songs
    FOR SELECT TO authenticated
    USING (TRUE);

-- write: somente quem é dono da setlist pode adicionar/remover músicas
CREATE POLICY "setlist_songs_write_own" ON public.setlist_songs
    FOR INSERT TO authenticated
    WITH CHECK (
        setlist_id IN (SELECT id FROM public.setlists WHERE user_id = auth.uid())
    );

CREATE POLICY "setlist_songs_delete_own" ON public.setlist_songs
    FOR DELETE TO authenticated
    USING (
        setlist_id IN (SELECT id FROM public.setlists WHERE user_id = auth.uid())
    );
