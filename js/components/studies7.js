/**
 * HMS — Estudos 7 Cordas
 * Baixarias de Dino 7 Cordas em harmonia funcional.
 * Exposed via window.Studies7Component
 */
(function () {
    'use strict';

    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const KEYS = window.HarmonyEngine.allKeys();

    // ── Exemplos de baixarias ────────────────────────────────────────
    // rhythm: 'colcheia' | 'semicolcheia'
    // defaultBpm: velocidade sugerida para cada tipo
    const SECTIONS = [
        {
            id: 'dom_tonica',
            title: 'Dominante → Tônica',
            icon: 'fa-arrow-right',
            desc: 'Conduções do V grau resolvendo ao I grau.',
            examples: [
                {
                    id: 'dt_c1', rhythm: 'colcheia',      bpm: 80,
                    label: 'Básica',
                    harmony: '5 5/7 1/3 1',
                },
                {
                    id: 'dt_c2', rhythm: 'colcheia',      bpm: 80,
                    label: 'Com cromatismo descendente',
                    harmony: '5 5/7 5/5 5/3 1',
                },
                {
                    id: 'dt_s1', rhythm: 'semicolcheia',  bpm: 140,
                    label: 'Básica',
                    harmony: '5 5/7 5/5 5/3 1/5 1/3 1',
                },
                {
                    id: 'dt_s2', rhythm: 'semicolcheia',  bpm: 140,
                    label: 'Com baixo estendido',
                    harmony: '5 5/7 5/5 5/3 1/5 1/3 1/1 1',
                },
            ],
        },
        {
            id: 'dom_25_4',
            title: '2-5 do 4º grau',
            icon: 'fa-4',
            desc: 'ii-V secundário resolvendo ao IV grau.',
            examples: [
                {
                    id: '25_4_c1', rhythm: 'colcheia',     bpm: 80,
                    label: 'Básica',
                    harmony: '25(4) 4',
                },
                {
                    id: '25_4_c2', rhythm: 'colcheia',     bpm: 80,
                    label: 'Com resolução',
                    harmony: '25(4) 4 4/3 1',
                },
                {
                    id: '25_4_s1', rhythm: 'semicolcheia', bpm: 140,
                    label: 'Básica',
                    harmony: '2m(4) 5(4) 4 4/3',
                },
                {
                    id: '25_4_s2', rhythm: 'semicolcheia', bpm: 140,
                    label: 'Com baixo caminhando',
                    harmony: '2m(4) 5(4) 4 4/3 4/5 1',
                },
            ],
        },
        {
            id: 'dom_25_6',
            title: '2-5 do 6º grau',
            icon: 'fa-6',
            desc: 'ii-V secundário resolvendo ao VI menor.',
            examples: [
                {
                    id: '25_6_c1', rhythm: 'colcheia',     bpm: 80,
                    label: 'Básica',
                    harmony: '25(6m) 6m',
                },
                {
                    id: '25_6_c2', rhythm: 'colcheia',     bpm: 80,
                    label: 'Com retorno à tônica',
                    harmony: '25(6m) 6m 6m/5 5 1',
                },
                {
                    id: '25_6_s1', rhythm: 'semicolcheia', bpm: 140,
                    label: 'Básica',
                    harmony: '2m(6m) 5(6m) 6m 6m/3',
                },
                {
                    id: '25_6_s2', rhythm: 'semicolcheia', bpm: 140,
                    label: 'Com baixo descendente',
                    harmony: '2m(6m) 5(6m) 6m 6m/5 6m/3 5 1',
                },
            ],
        },
        {
            id: 'dom_25_2',
            title: '2-5 do 2º grau',
            icon: 'fa-2',
            desc: 'ii-V secundário resolvendo ao II menor.',
            examples: [
                {
                    id: '25_2_c1', rhythm: 'colcheia',     bpm: 80,
                    label: 'Básica',
                    harmony: '25(2m) 2m',
                },
                {
                    id: '25_2_c2', rhythm: 'colcheia',     bpm: 80,
                    label: 'Com retorno à dominante',
                    harmony: '25(2m) 2m 5 1',
                },
                {
                    id: '25_2_s1', rhythm: 'semicolcheia', bpm: 140,
                    label: 'Básica',
                    harmony: '2m(2m) 5(2m) 2m 2m/3',
                },
                {
                    id: '25_2_s2', rhythm: 'semicolcheia', bpm: 140,
                    label: 'Com baixo caminhando',
                    harmony: '2m(2m) 5(2m) 2m 2m/5 5 1',
                },
            ],
        },
    ];

    // Per-card state: { key, isMinor, bpm, playing }
    const _state = {};

    // ── Helpers ──────────────────────────────────────────────────────
    function initState(ex) {
        if (!_state[ex.id]) {
            _state[ex.id] = { key: 'C', isMinor: false, bpm: ex.bpm, playing: false };
        }
    }

    function keyOptionsHtml(exId) {
        const st = _state[exId];
        return KEYS.map(k =>
            `<option value="${esc(k.value)}" ${k.value === (st.key + (st.isMinor ? 'm' : '')) ? 'selected' : ''}>${esc(k.label)}</option>`
        ).join('');
    }

    function renderChordBar(exId, harmonyStr) {
        const st = _state[exId];
        const tokens = window.HarmonyEngine.translate(harmonyStr, st.key, st.isMinor);
        return tokens.map(t => {
            if (t.type === 'LABEL')  return `<span class="harmony-text">${esc(t.value)}</span>`;
            if (t.type === 'STRUCT') return `<div class="chord-cell struct">${esc(t.value)}</div>`;
            return `<div class="chord-cell" style="font-size:1rem;padding:8px 14px;min-width:54px;">${esc(t.value)}</div>`;
        }).join('');
    }

    function rhythmBadge(rhythm) {
        const isColcheia = rhythm === 'colcheia';
        return `<span style="
            display:inline-flex;align-items:center;gap:5px;
            font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
            padding:3px 9px;border-radius:20px;
            background:${isColcheia ? 'rgba(74,222,128,.12)' : 'rgba(251,191,36,.12)'};
            color:${isColcheia ? 'var(--chord-green)' : 'var(--chord-amber)'};
            border:1px solid ${isColcheia ? 'var(--chord-green)' : 'var(--chord-amber)'};
        ">
            ${isColcheia
                ? '<i class="fa-solid fa-music"></i> Colcheia'
                : '<i class="fa-solid fa-music fa-xs"></i><i class="fa-solid fa-music fa-xs"></i> Semicolcheia'}
        </span>`;
    }

    function exampleCardHtml(ex) {
        initState(ex);
        return `
        <div class="panel" style="margin-bottom:1rem;" id="card-${esc(ex.id)}">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--line-color);flex-wrap:wrap;gap:8px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    ${rhythmBadge(ex.rhythm)}
                    <span style="font-size:0.9rem;font-weight:600;color:var(--text-primary);">${esc(ex.label)}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <select class="form-select s7-key-select" data-exid="${esc(ex.id)}"
                        style="font-size:0.8rem;padding:4px 8px;height:auto;width:auto;">
                        ${keyOptionsHtml(ex.id)}
                    </select>
                    <input type="number" class="form-input s7-bpm" data-exid="${esc(ex.id)}"
                        value="${_state[ex.id].bpm}" min="40" max="300"
                        style="width:64px;font-size:0.8rem;padding:4px 8px;text-align:center;" title="BPM">
                    <button class="btn btn-primary s7-play-btn" data-exid="${esc(ex.id)}" data-harmony="${esc(ex.harmony)}"
                        style="padding:5px 14px;font-size:0.8rem;">
                        <i class="fa-solid fa-play"></i>
                    </button>
                </div>
            </div>
            <div class="chord-grid size-md" style="padding:12px 14px;gap:6px;min-height:56px;" id="chords-${esc(ex.id)}">
                ${renderChordBar(ex.id, ex.harmony)}
            </div>
        </div>`;
    }

    function sectionHtml(sec) {
        return `
        <div style="margin-bottom:2rem;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:0.6rem;">
                <div class="page-title-icon" style="width:32px;height:32px;font-size:0.9rem;">
                    <i class="fa-solid ${esc(sec.icon)}"></i>
                </div>
                <div>
                    <h3 style="margin:0;font-size:1.05rem;">${esc(sec.title)}</h3>
                    <p style="margin:0;font-size:0.8rem;color:var(--text-muted);">${esc(sec.desc)}</p>
                </div>
            </div>

            <div style="margin-left:2px;">
                <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin:12px 0 6px;">Colcheias</div>
                ${sec.examples.filter(e => e.rhythm === 'colcheia').map(exampleCardHtml).join('')}
                <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin:16px 0 6px;">Semicolcheias</div>
                ${sec.examples.filter(e => e.rhythm === 'semicolcheia').map(exampleCardHtml).join('')}
            </div>
        </div>`;
    }

    // ── Component ────────────────────────────────────────────────────
    const Studies7Component = {

        render: function () {
            const content = document.getElementById('main-content');
            content.innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-guitar"></i></div>
                        <div>
                            <h2>Estudos 7 Cordas</h2>
                            <p>Baixarias de Dino 7 Cordas — conduções em harmonia funcional</p>
                        </div>
                    </div>
                </div>

                ${SECTIONS.map(sectionHtml).join('')}
            `;

            Studies7Component._bindEvents();
        },

        _bindEvents: function () {
            const content = document.getElementById('main-content');

            // Key selector
            content.querySelectorAll('.s7-key-select').forEach(sel => {
                sel.addEventListener('change', e => {
                    const exId = e.target.dataset.exid;
                    const val  = e.target.value;
                    _state[exId].isMinor = val.endsWith('m');
                    _state[exId].key     = val.replace(/m$/, '');
                    Studies7Component._refreshChords(exId);
                });
            });

            // BPM input
            content.querySelectorAll('.s7-bpm').forEach(inp => {
                inp.addEventListener('change', e => {
                    const exId = e.target.dataset.exid;
                    _state[exId].bpm = Math.max(40, Math.min(300, parseInt(e.target.value) || 80));
                    e.target.value = _state[exId].bpm;
                });
            });

            // Play buttons
            content.querySelectorAll('.s7-play-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    const exId   = e.currentTarget.dataset.exid;
                    const harmony = e.currentTarget.dataset.harmony;
                    Studies7Component._togglePlay(exId, harmony, e.currentTarget);
                });
            });
        },

        _refreshChords: function (exId) {
            const ex = SECTIONS.flatMap(s => s.examples).find(e => e.id === exId);
            if (!ex) return;
            const bar = document.getElementById('chords-' + exId);
            if (bar) bar.innerHTML = renderChordBar(exId, ex.harmony);
        },

        _togglePlay: function (exId, harmony, btn) {
            const st = _state[exId];

            if (st.playing) {
                window.HMSAudio.stop();
                st.playing = false;
                btn.innerHTML = '<i class="fa-solid fa-play"></i>';
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
                return;
            }

            const tokens = window.HarmonyEngine.translate(harmony, st.key, st.isMinor);

            // Stop any other card that might be playing
            document.querySelectorAll('.s7-play-btn').forEach(b => {
                const otherId = b.dataset.exid;
                if (otherId !== exId && _state[otherId]?.playing) {
                    _state[otherId].playing = false;
                    b.innerHTML = '<i class="fa-solid fa-play"></i>';
                    b.classList.remove('btn-secondary');
                    b.classList.add('btn-primary');
                }
            });

            st.playing = true;
            btn.innerHTML = '<i class="fa-solid fa-stop"></i>';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');

            window.HMSAudio.playSequence(tokens, st.bpm, () => {
                st.playing = false;
                btn.innerHTML = '<i class="fa-solid fa-play"></i>';
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
            });
        },
    };

    window.Studies7Component = Studies7Component;
    console.info('[HMS] Studies7Component loaded.');
})();
