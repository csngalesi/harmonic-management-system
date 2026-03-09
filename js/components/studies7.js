/**
 * HMS — Estudos Cadências
 * Estudo de audição de cadências em harmonia funcional.
 * Exposed via window.Studies7Component
 */
(function () {
    'use strict';

    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const KEYS = window.HarmonyEngine.allKeys();

    // ── Cadências ────────────────────────────────────────────────────
    const SECTIONS = [
        {
            id: 'dom_tonica',
            title: 'Dominante → Tônica',
            cadences: [
                { id: 'c_51',   label: '5 → 1',       harmony: '5 1' },
            ],
        },
        {
            id: 'secundarias',
            title: 'Cadências Secundárias',
            cadences: [
                { id: 'c_25_4', label: '25 do 4',     harmony: '25(4) 4' },
                { id: 'c_25_6', label: '25 do 6',     harmony: '25(6m) 6m' },
                { id: 'c_25_3', label: '25 do 3',     harmony: '25(3m) 3m' },
                { id: 'c_5525', label: '5.5 / 251',   harmony: '5.5 25 1' },
            ],
        },
    ];

    // ── Global state ─────────────────────────────────────────────────
    const _state = {
        key: 'C',
        isMinor: false,
        bpm: 80,
        playing: null, // id of currently playing card
        harmonies: {}, // editable harmony per cadence id
    };

    // Seed harmonies from SECTIONS defaults
    SECTIONS.forEach(sec => sec.cadences.forEach(cad => {
        _state.harmonies[cad.id] = cad.harmony;
    }));

    // ── Helpers ──────────────────────────────────────────────────────
    function renderChordBar(harmony) {
        const tokens = window.HarmonyEngine.translate(harmony, _state.key, _state.isMinor);
        return tokens.map(t => {
            if (t.type === 'LABEL')  return `<span class="harmony-text">${esc(t.value)}</span>`;
            if (t.type === 'STRUCT') return `<div class="chord-cell struct">${esc(t.value)}</div>`;
            return `<div class="chord-cell" style="font-size:1.1rem;padding:10px 18px;min-width:64px;">${esc(t.value)}</div>`;
        }).join('');
    }

    function cadenceCardHtml(cad) {
        const isPlaying = _state.playing === cad.id;
        const harmony   = _state.harmonies[cad.id];
        return `
        <div class="panel" style="margin-bottom:0.75rem;" id="card-${esc(cad.id)}">
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line-color);">
                <span style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);white-space:nowrap;min-width:90px;">${esc(cad.label)}</span>
                <input type="text" class="form-input s7-harmony-input" data-cadid="${esc(cad.id)}"
                    value="${esc(harmony)}"
                    style="flex:1;font-family:var(--font-mono);font-size:0.82rem;padding:5px 10px;">
                <button class="btn ${isPlaying ? 'btn-secondary' : 'btn-primary'} s7-play-btn"
                    data-cadid="${esc(cad.id)}"
                    style="padding:5px 16px;font-size:0.85rem;flex-shrink:0;">
                    <i class="fa-solid fa-${isPlaying ? 'stop' : 'play'}"></i>
                </button>
            </div>
            <div class="chord-grid size-md" style="padding:12px 14px;gap:8px;min-height:60px;" id="chords-${esc(cad.id)}">
                ${renderChordBar(harmony)}
            </div>
        </div>`;
    }

    function sectionHtml(sec) {
        return `
        <div style="margin-bottom:2rem;">
            <h3 style="font-size:1rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;
                letter-spacing:.06em;margin-bottom:0.75rem;border-bottom:1px solid var(--line-color);padding-bottom:6px;">
                ${esc(sec.title)}
            </h3>
            ${sec.cadences.map(cadenceCardHtml).join('')}
        </div>`;
    }

    // ── Component ────────────────────────────────────────────────────
    const Studies7Component = {

        render: function () {
            const content = document.getElementById('main-content');
            const keyOptions = KEYS.map(k =>
                `<option value="${esc(k.value)}" ${k.value === (_state.key + (_state.isMinor ? 'm' : '')) ? 'selected' : ''}>${esc(k.label)}</option>`
            ).join('');

            content.innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-ear-listen"></i></div>
                        <div>
                            <h2>Estudos Cadências</h2>
                            <p>Estudo de audição em harmonia funcional</p>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                        <select class="form-select" id="s7-global-key" style="width:auto;">
                            ${keyOptions}
                        </select>
                        <input type="number" class="form-input" id="s7-global-bpm"
                            value="${_state.bpm}" min="40" max="300"
                            style="width:68px;text-align:center;" title="BPM">
                    </div>
                </div>

                <div id="s7-sections">
                    ${SECTIONS.map(sectionHtml).join('')}
                </div>
            `;

            Studies7Component._bindEvents();
        },

        _refreshAllChords: function () {
            SECTIONS.forEach(sec => sec.cadences.forEach(cad => {
                const bar = document.getElementById('chords-' + cad.id);
                if (bar) bar.innerHTML = renderChordBar(_state.harmonies[cad.id]);
            }));
        },

        _bindEvents: function () {
            document.getElementById('s7-global-key').addEventListener('change', e => {
                const val = e.target.value;
                _state.isMinor = val.endsWith('m');
                _state.key     = val.replace(/m$/, '');
                Studies7Component._refreshAllChords();
            });

            document.getElementById('s7-global-bpm').addEventListener('change', e => {
                _state.bpm = Math.max(40, Math.min(300, parseInt(e.target.value) || 80));
                e.target.value = _state.bpm;
            });

            // Editable harmony inputs — update chord bar live on each keystroke
            document.querySelectorAll('.s7-harmony-input').forEach(inp => {
                inp.addEventListener('input', e => {
                    const cadId = e.target.dataset.cadid;
                    _state.harmonies[cadId] = e.target.value;
                    const bar = document.getElementById('chords-' + cadId);
                    if (bar) bar.innerHTML = renderChordBar(_state.harmonies[cadId]);
                });
            });

            document.querySelectorAll('.s7-play-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    const cadId = e.currentTarget.dataset.cadid;
                    Studies7Component._togglePlay(cadId);
                });
            });
        },

        _setPlayingUI: function (cadId, playing) {
            const btn = document.querySelector(`.s7-play-btn[data-cadid="${cadId}"]`);
            if (!btn) return;
            btn.innerHTML = `<i class="fa-solid fa-${playing ? 'stop' : 'play'}"></i>`;
            btn.className = `btn ${playing ? 'btn-secondary' : 'btn-primary'} s7-play-btn`;
        },

        _togglePlay: function (cadId) {
            // Stop current
            if (_state.playing) {
                window.HMSAudio.stop();
                Studies7Component._setPlayingUI(_state.playing, false);
                const wasSame = _state.playing === cadId;
                _state.playing = null;
                if (wasSame) return;
            }

            // Play new card using current (possibly edited) harmony
            const tokens = window.HarmonyEngine.translate(_state.harmonies[cadId], _state.key, _state.isMinor);
            _state.playing = cadId;
            Studies7Component._setPlayingUI(cadId, true);

            window.HMSAudio.playSequence(tokens, _state.bpm, () => {
                _state.playing = null;
                Studies7Component._setPlayingUI(cadId, false);
            });
        },
    };

    window.Studies7Component = Studies7Component;
    console.info('[HMS] Studies7Component (Estudos Cadências) loaded.');
})();
