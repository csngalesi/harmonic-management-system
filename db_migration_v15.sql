-- ============================================================
-- HMS Migration v15 — Storage RLS para bucket songs-audio
-- Cria a bucket (se não existir) e adiciona políticas para
-- que usuários autenticados possam fazer upload, leitura e
-- exclusão de arquivos MP3.
-- Execute no SQL Editor do dashboard do Supabase.
-- ============================================================

-- 1. Criar a bucket songs-audio se ainda não existir
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'songs-audio',
    'songs-audio',
    true,                        -- pública: links de áudio funcionam sem autenticação
    52428800,                    -- 50 MB por arquivo
    ARRAY['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/aac', 'audio/x-m4a']
)
ON CONFLICT (id) DO UPDATE SET
    public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Remove políticas antigas (se existirem) para evitar conflito
DROP POLICY IF EXISTS "songs_audio_insert"  ON storage.objects;
DROP POLICY IF EXISTS "songs_audio_select"  ON storage.objects;
DROP POLICY IF EXISTS "songs_audio_update"  ON storage.objects;
DROP POLICY IF EXISTS "songs_audio_delete"  ON storage.objects;

-- 3. Política de UPLOAD: qualquer usuário autenticado pode fazer upload
CREATE POLICY "songs_audio_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'songs-audio');

-- 4. Política de LEITURA: público pode ler (necessário para reprodução sem token)
CREATE POLICY "songs_audio_select" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'songs-audio');

-- 5. Política de UPDATE/REPLACE: usuários autenticados podem substituir arquivos
CREATE POLICY "songs_audio_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'songs-audio')
    WITH CHECK (bucket_id = 'songs-audio');

-- 6. Política de DELETE: usuários autenticados podem excluir arquivos
CREATE POLICY "songs_audio_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'songs-audio');
