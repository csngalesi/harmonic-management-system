// Supabase Edge Function — musixmatch-proxy
// Faz a chamada server-side para a API do Musixmatch, contornando CORS.
// Deploy: supabase functions deploy musixmatch-proxy

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const MUSIXMATCH_KEY = Deno.env.get('MUSIXMATCH_KEY') ?? '';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

serve(async (req: Request) => {
    // Preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url    = new URL(req.url);
    const artist = url.searchParams.get('artist') ?? '';
    const title  = url.searchParams.get('title')  ?? '';

    if (!artist || !title) {
        return new Response(
            JSON.stringify({ error: 'Parâmetros artist e title são obrigatórios.' }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }

    if (!MUSIXMATCH_KEY) {
        return new Response(
            JSON.stringify({ error: 'MUSIXMATCH_KEY não configurada no servidor.' }),
            { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }

    try {
        const mmUrl =
            `https://api.musixmatch.com/ws/1.1/matcher.lyrics.get` +
            `?format=json` +
            `&q_track=${encodeURIComponent(title)}` +
            `&q_artist=${encodeURIComponent(artist)}` +
            `&apikey=${MUSIXMATCH_KEY}`;

        const mmRes  = await fetch(mmUrl);
        const mmData = await mmRes.json();

        const statusCode = mmData?.message?.header?.status_code ?? 0;

        if (statusCode !== 200) {
            return new Response(
                JSON.stringify({ lyrics: null, status: statusCode }),
                { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
            );
        }

        const rawLyrics: string = mmData?.message?.body?.lyrics?.lyrics_body ?? '';

        // Remove o rodapé/disclaimer do Musixmatch (começa com *******)
        const lyrics = rawLyrics.replace(/\*{7}[\s\S]*$/m, '').trim() || null;

        return new Response(
            JSON.stringify({ lyrics }),
            { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );

    } catch (err) {
        return new Response(
            JSON.stringify({ error: String(err) }),
            { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
    }
});
