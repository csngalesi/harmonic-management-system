-- ============================================================
-- HMS — Migration v19
-- guitar_samples: acesso completo para todos os usuários autenticados
-- ============================================================

-- 1. Remover políticas restritivas existentes
DROP POLICY IF EXISTS "guitar_samples: users read own"   ON public.guitar_samples;
DROP POLICY IF EXISTS "guitar_samples: users insert own"  ON public.guitar_samples;
DROP POLICY IF EXISTS "guitar_samples: users update own"  ON public.guitar_samples;
DROP POLICY IF EXISTS "guitar_samples: users delete own"  ON public.guitar_samples;
DROP POLICY IF EXISTS "guitar_samples: all users read all" ON public.guitar_samples;

-- 2. Novas políticas: todos os autenticados têm acesso completo
CREATE POLICY "guitar_samples: all authenticated read"
    ON public.guitar_samples FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "guitar_samples: all authenticated insert"
    ON public.guitar_samples FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "guitar_samples: all authenticated update"
    ON public.guitar_samples FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY "guitar_samples: all authenticated delete"
    ON public.guitar_samples FOR DELETE
    TO authenticated
    USING (true);
