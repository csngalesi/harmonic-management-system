/**
 * HMS — Supabase Client
 * ⚠️  Replace SUPABASE_URL and SUPABASE_KEY with your HMS project credentials.
 *     Go to: Supabase Dashboard → Settings → API
 */
(function () {
    'use strict';

    const SUPABASE_URL = 'https://knwpgznnipufvwobgrzf.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_6EcRJu9jjDgGDCqQ7ONk7A_ziNab68X';

    if (typeof window.supabase === 'undefined') {
        console.error('[HMS] CRITICAL: Supabase SDK not loaded. Serve via HTTP, not file://');
        window.supabaseClient = null;
        return;
    }

    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.info('[HMS] Supabase client initialized.');
})();
