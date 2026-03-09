/**
 * HMS — Estudos Melódicos Component
 * Frases melódicas funcionais (baixarias, conduções) transponiveis.
 * Exposed via window.MelodicStudiesComponent
 */
(function () {
    'use strict';

    const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    // ── Estudos base ─────────────────────────────────────────────────────────
    const SECTIONS = [
        {
            id: 'conduções',
            title: 'Conduções Diatônicas',
            desc: 'Movimentos escalares de marcação, I→IV e retornos.',
            studies: [
                { id: 'm_cond_maj_up',   label: 'Maior — Ascendente',   melody: '1:4n 2:4n 3:4n 4:4n 5:2n' },
                { id: 'm_cond_maj_down', label: 'Maior — Descendente',  melody: '5:4n 4:4n 3:4n 2:4n 1:2n' },
                { id: 'm_cond_min_up',   label: 'Menor — Ascendente',   melody: '1:4n 2:4n b3:4n 4:4n 5:2n' },
                { id: 'm_cond_min_down', label: 'Menor — Descendente',  melody: '5:4n 4:4n b3:4n 2:4n 1:2n' },
            ],
        },
        {
            id: 'walking',
            title: 'Walking Bass — Dino 7 Cordas',
            desc: 'Caminhada I→IV em colcheias com cromatismo e baixo grave. (2/4 Choro)',
            studies: [
                {
                    id: 'm_walking_bass',
                    label: 'Walking Bass I→IV',
                    melody: '1:8n 2:8n b3:8n 3:8n 4:4n 1:8n 6(-1):8n 1(-1):2n',
                },
            ],
        },
        {
            id: 'baixarias',
            title: 'Baixarias (7ª Corda)',
            desc: 'Conduções na corda grave usando oct=-1.',
            studies: [
                { id: 'm_cinco_um',  label: '5 → 1 diatônica',    melody: '5(-1):8n 6(-1):8n 7(-1):8n 1:4n' },
                { id: 'm_crom_up',   label: 'Cromática → 1 (↑)',  melody: 'b7(-1):8n 7(-1):8n 1:4n' },
                { id: 'm_crom_down', label: 'Cromática → 1 (↓)',  melody: 'b3:8n 2:8n b2:8n 1:4n' },
                { id: 'm_25_prep',   label: 'Prep. 25 (↑)',       melody: '2(-1):8n 3(-1):8n 4(-1):8n 5(-1):4n' },
            ],
        },
        {
            id: 'breque',
            title: 'Breque em Semicolcheias — Dino 7 Cordas',
            desc: 'Frase rápida síncopada IIm→V7→I com arpejo, descida e cromatismo final.',
            studies: [
                {
                    id: 'm_breque',
                    label: 'Breque IIm→V7→I',
                    melody: '1:16n b3:16n 5:16n b3:16n 4:16n 2:16n 6(-1):16n 4(-1):16n 3:16n b3:16n 2:16n #1:16n 1(-1):8n',
                },
            ],
        },
        {
            id: 'livre',
            title: 'Livre',
            desc: '',
            studies: [
                { id: 'm_livre_1', label: 'Livre 1', melody: '' },
                { id: 'm_livre_2', label: 'Livre 2', melody: '' },
            ],
        },
    ];

    // ── Global state ─────────────────────────────────────────────────────────
    const _state = {
        root:    'C',
        bpm:     80,
        playing: null,        // id of currently playing study
        melodies: {},         // editable melody string per study id
    };

    // Seed melodies from SECTIONS defaults
    SECTIONS.forEach(sec => sec.studies.forEach(s => {
        _state.melodies[s.id] = s.melody;
    }));

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _noteChips(melodyStr, root) {
        if (!melodyStr.trim()) return '<span style="color:var(--text-muted);font-size:.8rem;">—</span>';
        try {
            const parsed = window.MelodyEngine.parse(melodyStr);
            if (!parsed.length) return '<span style="color:var(--text-muted);font-size:.8rem;">—</span>';
            const names = window.MelodyEngine.noteNames(parsed, root);
            return names.map((n, i) => {
                const dur  = parsed[i]?.dur || '8n';
                const isRoot = parsed[i]?.deg === '1';
                const color = isRoot ? 'var(--brand,#7c3aed)' : 'var(--chord-blue,#60a5fa)';
                return `<div style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;margin-right:6px;">
                    <span style="font-family:var(--font-mono);font-size:.82rem;font-weight:600;color:${color};">${esc(n)}</span>
                    <span style="font-size:.62rem;color:var(--text-muted);">${esc(dur)}</span>
                </div>`;
            }).join('');
        } catch (_) {
            return '<span style="color:var(--chord-amber);font-size:.8rem;">parse error</span>';
        }
    }

    function _studyCardHtml(s) {
        const isPlaying = _state.playing === s.id;
        const melody    = _state.melodies[s.id];
        return `
        <div class="panel" style="margin-bottom:0.75rem;" id="ms-card-${esc(s.id)}">
            <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line-color);">
                <span style="font-size:.82rem;font-weight:600;color:var(--text-secondary);white-space:nowrap;min-width:140px;">${esc(s.label)}</span>
                <input type="text" class="form-input ms-melody-input" data-sid="${esc(s.id)}"
                    value="${esc(melody)}"
                    placeholder="ex: 1:4n 2:4n b3:4n 4:4n"
                    style="flex:1;font-family:var(--font-mono);font-size:.8rem;padding:5px 10px;" />
                <button class="btn ${isPlaying ? 'btn-secondary' : 'btn-primary'} ms-play-btn"
                    data-sid="${esc(s.id)}"
                    style="padding:5px 16px;font-size:.85rem;flex-shrink:0;">
                    <i class="fa-solid fa-${isPlaying ? 'stop' : 'play'}"></i>
                </button>
            </div>
            <div style="padding:10px 14px;min-height:44px;display:flex;align-items:center;flex-wrap:wrap;gap:4px;"
                id="ms-notes-${esc(s.id)}">
                ${_noteChips(melody, _state.root)}
            </div>
        </div>`;
    }

    function _sectionHtml(sec) {
        return `
        <div style="margin-bottom:2rem;">
            <h3 style="font-size:.9rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;
                letter-spacing:.06em;margin-bottom:.75rem;border-bottom:1px solid var(--line-color);padding-bottom:6px;">
                ${esc(sec.title)}
            </h3>
            ${sec.studies.map(_studyCardHtml).join('')}
        </div>`;
    }

    // ── Component ─────────────────────────────────────────────────────────────
    const MelodicStudiesComponent = {

        render: function () {
            const content = document.getElementById('main-content');

            const rootOptions = NOTE_NAMES.map(n =>
                `<option value="${n}" ${n === _state.root ? 'selected' : ''}>${n}</option>`
            ).join('');

            content.innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-wave-square"></i></div>
                        <div>
                            <h2>Estudos Melódicos</h2>
                            <p>Baixarias e conduções funcionais — transponíveis em qualquer tom</p>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                        <select class="form-select" id="ms-global-root" style="width:auto;">${rootOptions}</select>
                        <input type="number" class="form-input" id="ms-global-bpm"
                            value="${_state.bpm}" min="20" max="300"
                            style="width:68px;text-align:center;" title="BPM">
                    </div>
                </div>

                <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:1.25rem;padding:8px 12px;
                    background:var(--bg-raised);border-radius:var(--radius-sm);border-left:3px solid var(--brand);">
                    <strong>Formato:</strong>
                    <code style="font-family:var(--font-mono);">grau(oitava):duração</code>
                    &nbsp;·&nbsp; Graus: <code>1 b2 2 b3 3 4 #4 5 b6 6 b7 7</code>
                    &nbsp;·&nbsp; Oitava: <code>(-1)</code>=grave <code>(0)</code>=base <code>(1)</code>=agudo
                    &nbsp;·&nbsp; Dur: <code>16n 8n 4n 2n 1n 8n. 4t…</code>
                </div>

                <div id="ms-sections">
                    ${SECTIONS.map(_sectionHtml).join('')}
                </div>
            `;

            MelodicStudiesComponent._bindEvents();
        },

        _refreshAllNotes: function () {
            SECTIONS.forEach(sec => sec.studies.forEach(s => {
                const el = document.getElementById('ms-notes-' + s.id);
                if (el) el.innerHTML = _noteChips(_state.melodies[s.id], _state.root);
            }));
        },

        _setPlayingUI: function (sid, playing) {
            const btn = document.querySelector(`.ms-play-btn[data-sid="${sid}"]`);
            if (!btn) return;
            btn.innerHTML = `<i class="fa-solid fa-${playing ? 'stop' : 'play'}"></i>`;
            btn.className = `btn ${playing ? 'btn-secondary' : 'btn-primary'} ms-play-btn`;
        },

        _togglePlay: function (sid) {
            if (_state.playing) {
                window.HMSAudio.stop();
                MelodicStudiesComponent._setPlayingUI(_state.playing, false);
                const wasSame = _state.playing === sid;
                _state.playing = null;
                if (wasSame) return;
            }

            const melodyStr = _state.melodies[sid];
            if (!melodyStr || !melodyStr.trim()) {
                window.HMSApp.showToast('Campo de melodia vazio.', 'warning');
                return;
            }

            const parsed = window.MelodyEngine.parse(melodyStr);
            if (!parsed.length) {
                window.HMSApp.showToast('Não foi possível parsear a melodia.', 'warning');
                return;
            }

            const notes = window.MelodyEngine.translate(parsed, _state.root);
            _state.playing = sid;
            MelodicStudiesComponent._setPlayingUI(sid, true);

            window.HMSAudio.playMelody(notes, _state.bpm, () => {
                _state.playing = null;
                MelodicStudiesComponent._setPlayingUI(sid, false);
            });
        },

        _bindEvents: function () {
            document.getElementById('ms-global-root').addEventListener('change', e => {
                _state.root = e.target.value;
                MelodicStudiesComponent._refreshAllNotes();
            });

            document.getElementById('ms-global-bpm').addEventListener('change', e => {
                _state.bpm = Math.max(20, Math.min(300, parseInt(e.target.value) || 80));
                e.target.value = _state.bpm;
            });

            // Live update notes preview on input
            document.querySelectorAll('.ms-melody-input').forEach(inp => {
                inp.addEventListener('input', e => {
                    const sid = e.target.dataset.sid;
                    _state.melodies[sid] = e.target.value;
                    const el = document.getElementById('ms-notes-' + sid);
                    if (el) el.innerHTML = _noteChips(_state.melodies[sid], _state.root);
                });
            });

            document.querySelectorAll('.ms-play-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    MelodicStudiesComponent._togglePlay(e.currentTarget.dataset.sid);
                });
            });
        },
    };

    window.MelodicStudiesComponent = MelodicStudiesComponent;
    console.info('[HMS] MelodicStudiesComponent loaded.');
})();
