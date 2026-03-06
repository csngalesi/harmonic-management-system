-- ============================================================
-- Harmonic Management System (HMS) — Schema SQL v1
-- Execute no SQL Editor do dashboard do Supabase.
-- ============================================================

-- ============================================================
-- 1. TABELAS
-- ============================================================

-- Profiles (ligado ao Auth do Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Músicas
CREATE TABLE IF NOT EXISTS public.songs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    artist       TEXT,
    composer     TEXT,
    genre        TEXT,
    original_key TEXT NOT NULL DEFAULT 'C',
    harmony_str  TEXT NOT NULL DEFAULT '',
    lyrics       TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Setlists (agrupamentos / pastas)
CREATE TABLE IF NOT EXISTS public.setlists (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Relacionamento N:N setlist <-> song
CREATE TABLE IF NOT EXISTS public.setlist_songs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setlist_id  UUID NOT NULL REFERENCES public.setlists(id) ON DELETE CASCADE,
    song_id     UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL DEFAULT 0,
    UNIQUE (setlist_id, song_id)
);

-- ============================================================
-- 2. TRIGGER: atualiza updated_at de songs automaticamente
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_songs_updated_at ON public.songs;
CREATE TRIGGER trg_songs_updated_at
    BEFORE UPDATE ON public.songs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. TRIGGER: cria profile automaticamente ao criar usuário
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_profile ON auth.users;
CREATE TRIGGER trg_create_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.songs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setlists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setlist_songs ENABLE ROW LEVEL SECURITY;

-- Profiles: cada usuário vê e edita apenas o próprio
CREATE POLICY "profiles_own" ON public.profiles
    FOR ALL TO authenticated
    USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Songs: cada usuário gerencia suas músicas
CREATE POLICY "songs_own" ON public.songs
    FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Setlists: idem
CREATE POLICY "setlists_own" ON public.setlists
    FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Setlist_songs: via setlist do usuário
CREATE POLICY "setlist_songs_own" ON public.setlist_songs
    FOR ALL TO authenticated
    USING (
        setlist_id IN (SELECT id FROM public.setlists WHERE user_id = auth.uid())
    )
    WITH CHECK (
        setlist_id IN (SELECT id FROM public.setlists WHERE user_id = auth.uid())
    );

-- ============================================================
-- 5. ÍNDICES (performance)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_songs_user      ON public.songs(user_id);
CREATE INDEX IF NOT EXISTS idx_songs_title     ON public.songs(title);
CREATE INDEX IF NOT EXISTS idx_setlists_user   ON public.setlists(user_id);
CREATE INDEX IF NOT EXISTS idx_ss_setlist      ON public.setlist_songs(setlist_id);
CREATE INDEX IF NOT EXISTS idx_ss_song         ON public.setlist_songs(song_id);
