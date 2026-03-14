/**
 * HMS — Estudos Melódicos Component
 * Frases melódicas funcionais (baixarias, conduções) transponiveis.
 * Exposed via window.MelodicStudiesComponent
 */
(function () {
    'use strict';

    const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    const SCALES = {
        major:     { label: 'Maior',           intervals: [0, 2, 4, 5, 7, 9, 11] },
        nat_minor: { label: 'Menor Natural',    intervals: [0, 2, 3, 5, 7, 8, 10] },
        har_minor: { label: 'Menor Harmônica',  intervals: [0, 2, 3, 5, 7, 8, 11] },
        mel_minor: { label: 'Menor Melódica',   intervals: [0, 2, 3, 5, 7, 9, 11] },
    };

    // ── Estudos base ─────────────────────────────────────────────────────────
    const SECTIONS = [
        {
            id: 'conduções',
            title: 'Conduções Diatônicas',
            desc: 'Movimentos escalares de marcação, I→IV e retornos.',
            studies: [
                { id: 'm_cond_maj_up',   label: 'Maior — Ascendente',   melody: '1:4n 2:4n 3:4n 4:4n 5:2n',   harmony: '1 2m 3m 4 5' },
                { id: 'm_cond_maj_down', label: 'Maior — Descendente',  melody: '5:4n 4:4n 3:4n 2:4n 1:2n',   harmony: '5 4 3m 2m 1' },
                { id: 'm_cond_min_up',   label: 'Menor — Ascendente',   melody: '1:4n 2:4n b3:4n 4:4n 5:2n',  harmony: '1m 2h 3 4m 5' },
                { id: 'm_cond_min_down', label: 'Menor — Descendente',  melody: '5:4n 4:4n b3:4n 2:4n 1:2n',  harmony: '5 4m 3 2h 1m' },
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
                    harmony: '1 4',
                },
            ],
        },
        {
            id: 'baixarias',
            title: 'Baixarias (7ª Corda)',
            desc: 'Conduções na corda grave usando oct=-1.',
            studies: [
                { id: 'm_cinco_um',  label: '5 → 1 diatônica',    melody: '5(-1):8n 6(-1):8n 7(-1):8n 1:4n',           harmony: '5 1' },
                { id: 'm_crom_up',   label: 'Cromática → 1 (↑)',  melody: 'b7(-1):8n 7(-1):8n 1:4n',                   harmony: '5 1' },
                { id: 'm_crom_down', label: 'Cromática → 1 (↓)',  melody: 'b3:8n 2:8n b2:8n 1:4n',                     harmony: '5 1' },
                { id: 'm_25_prep',   label: 'Prep. 25 (↑)',       melody: '2(-1):8n 3(-1):8n 4(-1):8n 5(-1):4n',       harmony: '25(5) 5' },
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
                    harmony: '25(1) 1',
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
        root:        'C',
        scaleKey:    'major',
        bpm:         80,
        timeSig:     '2/4',      // fórmula de compasso
        playing:     null,       // id of currently playing study / 'rp_<uuid>'
        melodies:    {},         // editable melody string per study id
        harmonies:   {},         // editable harmony string per study id
        // Repositório
        tab:           'exemplos',   // 'exemplos' | 'repositorio'
        phrases:       [],           // loaded from DB
        editingId:     null,         // phrase id being edited inline
        newForm:       false,        // new-phrase form visible
        currentUserId: null,         // set on first repo load
    };

    // Seed melodies and harmonies from SECTIONS defaults
    SECTIONS.forEach(sec => sec.studies.forEach(s => {
        _state.melodies[s.id]  = s.melody;
        _state.harmonies[s.id] = s.harmony || '';
    }));

    // ── Helpers ───────────────────────────────────────────────────────────────

    // Fretboard constants shared by _noteChips and _fretboardSVG
    const FB_OPEN_MIDI  = [36, 40, 45, 50, 55, 59, 64]; // C2 E2 A2 D3 G3 B3 E4
    const FB_STR_LABELS = ['C','E','A','D','G','B','E'];
    const FB_FRETS = 5;

    function _isOnFretboard(midi) {
        for (let s = 0; s < 7; s++)
            for (let f = 0; f <= FB_FRETS; f++)
                if (FB_OPEN_MIDI[s] + f === midi) return true;
        return false;
    }

    function _scalePCs(root, scaleKey) {
        const rootIdx = NOTE_NAMES.indexOf(root);
        if (rootIdx === -1) return new Set();
        const intervals = (SCALES[scaleKey] || SCALES.major).intervals;
        return new Set(intervals.map(iv => (rootIdx + iv) % 12));
    }

    /**
     * Compute the effective root and scale for note colouring.
     * When a target degree is set (preparações 5/25), shift the context
     * to that degree's root so notes are coloured against the target scale.
     */
    function _effectiveContext(globalRoot, globalScaleKey, targetDeg) {
        if (!targetDeg) return { root: globalRoot, scaleKey: globalScaleKey };
        const intervals = (SCALES[globalScaleKey] || SCALES.major).intervals;
        const degIdx    = parseInt(targetDeg, 10) - 1; // degree 1 → index 0
        const st        = intervals[degIdx] ?? 0;
        const rootIdx   = NOTE_NAMES.indexOf(globalRoot);
        if (rootIdx === -1) return { root: globalRoot, scaleKey: globalScaleKey };
        const targetRoot = NOTE_NAMES[(rootIdx + st) % 12];
        return { root: targetRoot, scaleKey: 'major' }; // target treated as major
    }

    /**
     * Extracts the target degree from a functional harmony string.
     * Looks for `5(X)` or `25(X)` notation (secondary dominant/II-V).
     * The degree inside parentheses is the harmonic target.
     * Returns the degree string (e.g. '4') or null if none found.
     */
    function _detectTarget(harmonyStr) {
        if (!harmonyStr) return null;
        const m = harmonyStr.match(/2?5\((\d+)\)/);
        return m ? m[1] : null;
    }

    function _noteChips(melodyStr, root, scaleKey) {
        if (!melodyStr.trim()) return '<span style="color:var(--text-muted);font-size:.8rem;">—</span>';
        try {
            const parsed = window.MelodyEngine.parse(melodyStr);
            if (!parsed.length) return '<span style="color:var(--text-muted);font-size:.8rem;">—</span>';
            const translated = window.MelodyEngine.translate(parsed, root);
            const scalePCs   = _scalePCs(root, scaleKey);

            return translated.map((n, i) => {
                const midi    = Tone.Frequency(n.note).toMidi();
                const pc      = ((midi % 12) + 12) % 12;
                const onFb    = _isOnFretboard(midi);
                const isRoot  = parsed[i]?.deg === '1';
                const inScale = scalePCs.has(pc);

                let color;
                if (isRoot) {
                    color = 'var(--brand,#7c3aed)';
                } else if (!onFb) {
                    color = 'var(--chord-red,#f87171)';         // fora do braço
                } else if (inScale) {
                    color = 'var(--chord-blue,#60a5fa)';        // diatônica
                } else {
                    color = 'var(--chord-amber,#fbbf24)';       // cromática / passing tone
                }

                const isTied = parsed[i]?.tie;
                return `<div style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;margin-right:${isTied ? '0' : '6'}px;">
                    <span style="font-family:var(--font-mono);font-size:.82rem;font-weight:600;color:${color};">${esc(n.note)}</span>
                    <span style="font-size:.62rem;color:var(--text-muted);">${esc(n.dur)}${isTied ? '<span style="color:var(--brand);">~</span>' : ''}</span>
                </div>${isTied ? '<span style="font-size:.9rem;color:var(--text-muted);margin-right:4px;align-self:center;">⌒</span>' : ''}`;
            }).join('');
        } catch (_) {
            return '<span style="color:var(--chord-amber);font-size:.8rem;">parse error</span>';
        }
    }

    function _fretboardSVG(melodyStr, root, scaleKey) {
        if (!melodyStr || !melodyStr.trim()) return '';
        let parsed;
        try { parsed = window.MelodyEngine.parse(melodyStr); } catch (_) { return ''; }
        if (!parsed.length) return '';
        let translated;
        try { translated = window.MelodyEngine.translate(parsed, root); } catch (_) { return ''; }

        // Unique MIDI → {deg, isRoot} — melody hits
        const noteMap = new Map();
        translated.forEach((n, i) => {
            const midi = Tone.Frequency(n.note).toMidi();
            if (!noteMap.has(midi)) noteMap.set(midi, { deg: parsed[i].deg, isRoot: parsed[i].deg === '1' });
        });

        // Scale pitch classes (for background dots)
        const scalePCSet = _scalePCs(root, scaleKey);

        const OPEN_MIDI  = FB_OPEN_MIDI;
        const STR_LABELS = FB_STR_LABELS;
        const FRETS = FB_FRETS;
        const W = 300, H = 128, mL = 26, mR = 8, mT = 10, mB = 18;
        const neckW = W - mL - mR;
        const fretSp = neckW / FRETS;
        const strSp  = (H - mT - mB) / 6;

        // One position per unique MIDI — lowest fret first, then lowest string
        const candidates = [];
        for (const [midi, info] of noteMap) {
            for (let s = 0; s < 7; s++)
                for (let f = 0; f <= FRETS; f++)
                    if (OPEN_MIDI[s] + f === midi) candidates.push({ s, f, midi, ...info });
        }
        candidates.sort((a, b) => a.f - b.f || a.s - b.s);
        const seen = new Set();
        const hits = [];
        for (const c of candidates) {
            if (!seen.has(c.midi)) { seen.add(c.midi); hits.push(c); }
        }

        const p = [];
        p.push(`<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">`);
        p.push(`<rect x="${mL}" y="${mT-3}" width="${neckW}" height="${H-mT-mB+6}" fill="var(--bg-raised)" rx="2" opacity="0.4"/>`);
        for (let s = 0; s < 7; s++) {
            const y  = mT + s * strSp;
            const sw = (0.55 + (6 - s) * 0.22).toFixed(2);
            p.push(`<line x1="${mL}" y1="${y}" x2="${mL+neckW}" y2="${y}" stroke="var(--text-secondary)" stroke-width="${sw}" opacity="0.6"/>`);
            p.push(`<text x="${mL-4}" y="${y+4}" text-anchor="end" font-size="9" font-family="var(--font-mono)" fill="var(--text-muted)">${STR_LABELS[s]}</text>`);
        }
        p.push(`<line x1="${mL}" y1="${mT-5}" x2="${mL}" y2="${H-mB+5}" stroke="var(--text-primary)" stroke-width="2.5" stroke-linecap="round"/>`);
        for (let f = 1; f <= FRETS; f++) {
            const x = mL + f * fretSp;
            p.push(`<line x1="${x}" y1="${mT-3}" x2="${x}" y2="${H-mB+3}" stroke="var(--line-color)" stroke-width="1"/>`);
            p.push(`<text x="${x - fretSp/2}" y="${H-3}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${f}</text>`);
        }

        // Background scale dots (not melody hits)
        for (let s = 0; s < 7; s++) {
            for (let f = 0; f <= FRETS; f++) {
                const midi = OPEN_MIDI[s] + f;
                const pc   = ((midi % 12) + 12) % 12;
                if (scalePCSet.has(pc) && !noteMap.has(midi)) {
                    const cy = mT + s * strSp;
                    const cx = f === 0 ? mL - 13 : mL + (f - 0.5) * fretSp;
                    p.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="var(--chord-blue,#60a5fa)" opacity="0.18"/>`);
                }
            }
        }

        // Melody hit dots (foreground)
        for (const h of hits) {
            const cy   = mT + h.s * strSp;
            const cx   = h.f === 0 ? mL - 13 : mL + (h.f - 0.5) * fretSp;
            const fill = h.isRoot ? 'var(--brand,#7c3aed)' : 'var(--chord-blue,#60a5fa)';
            if (h.f === 0) {
                p.push(`<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="${fill}" stroke-width="1.8"/>`);
                p.push(`<text x="${cx}" y="${cy+3}" text-anchor="middle" font-size="8" font-weight="700" fill="${fill}">${h.deg}</text>`);
            } else {
                p.push(`<circle cx="${cx}" cy="${cy}" r="8" fill="${fill}" opacity="0.9"/>`);
                p.push(`<text x="${cx}" y="${cy+3}" text-anchor="middle" font-size="8" font-weight="700" fill="white">${h.deg}</text>`);
            }
        }
        p.push(`</svg>`);
        return p.join('');
    }

    function _studyCardHtml(s) {
        const isPlayingMel = _state.playing === s.id;
        const isPlayingAll = _state.playing === (s.id + '_all');
        const melody       = _state.melodies[s.id];
        const harmonyStr   = _state.harmonies[s.id] || '';
        const targetDeg    = _detectTarget(harmonyStr);
        const ctx          = _effectiveContext(_state.root, _state.scaleKey, targetDeg);
        const alvoLabel    = targetDeg
            ? `<span style="color:var(--brand);margin-left:6px;">→ ${targetDeg}º</span>`
            : '';
        return `
        <div class="panel" style="margin-bottom:0.75rem;" id="ms-card-${esc(s.id)}">
            <div style="display:flex;align-items:center;gap:8px;padding:10px 14px 6px;">
                <span style="font-size:.82rem;font-weight:600;color:var(--text-secondary);white-space:nowrap;min-width:140px;">${esc(s.label)}</span>
                <input type="text" class="form-input ms-melody-input" data-sid="${esc(s.id)}"
                    value="${esc(melody)}"
                    placeholder="ex: 1:4n 2:4n b3:4n 4:4n"
                    style="flex:1;font-family:var(--font-mono);font-size:.8rem;padding:5px 10px;" />
                <button class="btn ${isPlayingMel ? 'btn-secondary' : 'btn-primary'} ms-play-btn"
                    data-sid="${esc(s.id)}"
                    style="padding:5px 12px;font-size:.82rem;flex-shrink:0;" title="Tocar Melodia">
                    <i class="fa-solid fa-${isPlayingMel ? 'stop' : 'guitar'}"></i>
                </button>
            </div>
            <div style="display:flex;align-items:center;gap:8px;padding:4px 14px 8px;border-bottom:1px solid var(--line-color);">
                <span style="font-size:.72rem;color:var(--text-muted);white-space:nowrap;min-width:140px;">
                    Harm:${alvoLabel}
                </span>
                <input type="text" class="form-input ms-harmony-input" data-sid="${esc(s.id)}"
                    value="${esc(harmonyStr)}"
                    placeholder="ex: 25(5) 5  ou  5 1  ou  1 4"
                    style="flex:1;font-family:var(--font-mono);font-size:.78rem;padding:4px 10px;" />
                <button class="btn ${isPlayingAll ? 'btn-secondary' : 'btn-ghost'} ms-play-all-btn"
                    data-sid="${esc(s.id)}"
                    style="padding:5px 12px;font-size:.82rem;flex-shrink:0;" title="Tocar Tudo (melodia + harmonia)">
                    <i class="fa-solid fa-${isPlayingAll ? 'stop' : 'music'}"></i>
                </button>
            </div>
            <div style="display:flex;gap:14px;align-items:flex-start;padding:10px 14px;">
                <div style="flex:1;min-width:0;display:flex;align-items:center;flex-wrap:wrap;gap:4px;min-height:44px;"
                    id="ms-notes-${esc(s.id)}">
                    ${_noteChips(melody, ctx.root, ctx.scaleKey)}
                </div>
                <div style="flex-shrink:0;width:260px;" id="ms-fb-${esc(s.id)}">
                    ${_fretboardSVG(melody, ctx.root, ctx.scaleKey)}
                </div>
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

    // ── Repositório card helpers ──────────────────────────────────────────────

    function _phraseCardHtml(p) {
        const isOwner   = p.user_id === _state.currentUserId;
        const pPlayId   = 'rp_' + p.id;
        const isPlaying = _state.playing === pPlayId;
        const root      = p.root || 'C';
        const pScaleKey = p.scale_key || 'major';
        return `
        <div class="panel" style="margin-bottom:.75rem;" id="rp-card-${esc(p.id)}">
            <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line-color);">
                <div style="flex:1;min-width:0;">
                    <span style="font-size:.9rem;font-weight:600;color:var(--text-primary);">${esc(p.title)}</span>
                    ${p.description ? `<span style="font-size:.78rem;color:var(--text-muted);margin-left:10px;">${esc(p.description)}</span>` : ''}
                </div>
                <span style="font-size:.72rem;color:var(--text-muted);flex-shrink:0;">${esc(root)} · ${esc(SCALES[pScaleKey]?.label || 'Maior')} · ${p.bpm || 80} BPM</span>
                <button class="btn ${isPlaying ? 'btn-secondary' : 'btn-primary'} rp-play-btn"
                    data-id="${esc(p.id)}" style="padding:5px 14px;font-size:.85rem;flex-shrink:0;">
                    <i class="fa-solid fa-${isPlaying ? 'stop' : 'play'}"></i>
                </button>
                ${isOwner ? `
                <button class="btn btn-ghost rp-edit-btn" data-id="${esc(p.id)}" title="Editar"
                    style="padding:5px 10px;font-size:.85rem;flex-shrink:0;">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-ghost rp-del-btn" data-id="${esc(p.id)}" title="Deletar"
                    style="padding:5px 10px;font-size:.85rem;flex-shrink:0;color:var(--chord-red,#f87171);">
                    <i class="fa-solid fa-trash"></i>
                </button>` : ''}
            </div>
            <div style="display:flex;gap:14px;align-items:flex-start;padding:10px 14px;">
                <div style="flex:1;min-width:0;display:flex;align-items:center;flex-wrap:wrap;gap:4px;min-height:44px;">
                    ${_noteChips(p.melody, root, pScaleKey)}
                </div>
                <div style="flex-shrink:0;width:260px;">${_fretboardSVG(p.melody, root, pScaleKey)}</div>
            </div>
        </div>`;
    }

    function _phraseCardEditHtml(p) {
        const root      = p.root || 'C';
        const pScaleKey = p.scale_key || 'major';
        const rootOptions = NOTE_NAMES.map(n =>
            `<option value="${n}" ${n === root ? 'selected' : ''}>${n}</option>`
        ).join('');
        const scaleOptions = Object.entries(SCALES).map(([k, v]) =>
            `<option value="${k}" ${k === pScaleKey ? 'selected' : ''}>${esc(v.label)}</option>`
        ).join('');
        return `
        <div class="panel" style="margin-bottom:.75rem;border:1px solid var(--brand,#7c3aed);" id="rp-card-${esc(p.id)}">
            <div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;">
                <div style="display:flex;gap:8px;">
                    <input type="text" class="form-input" id="rp-edit-title-${esc(p.id)}"
                        value="${esc(p.title)}" placeholder="Título*" style="flex:1;" />
                    <input type="text" class="form-input" id="rp-edit-desc-${esc(p.id)}"
                        value="${esc(p.description || '')}" placeholder="Descrição" style="flex:2;" />
                </div>
                <input type="text" class="form-input rp-edit-melody" data-id="${esc(p.id)}"
                    id="rp-edit-melody-${esc(p.id)}" value="${esc(p.melody)}"
                    placeholder="ex: 1:4n 2:4n b3:4n 4:4n"
                    style="font-family:var(--font-mono);font-size:.8rem;" />
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <select class="form-select" id="rp-edit-root-${esc(p.id)}" style="width:auto;">${rootOptions}</select>
                    <select class="form-select" id="rp-edit-scale-${esc(p.id)}" style="width:auto;">${scaleOptions}</select>
                    <input type="number" class="form-input" id="rp-edit-bpm-${esc(p.id)}"
                        value="${p.bpm || 80}" min="20" max="300"
                        style="width:68px;text-align:center;" title="BPM" />
                    <div style="flex:1;min-width:100px;display:flex;align-items:center;flex-wrap:wrap;gap:4px;min-height:36px;"
                        id="rp-edit-chips-${esc(p.id)}">
                        ${_noteChips(p.melody, root, pScaleKey)}
                    </div>
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button class="btn btn-secondary rp-cancel-edit-btn" data-id="${esc(p.id)}">Cancelar</button>
                    <button class="btn btn-primary rp-save-edit-btn" data-id="${esc(p.id)}">
                        <i class="fa-solid fa-check"></i> Salvar
                    </button>
                </div>
            </div>
            <div style="display:flex;gap:14px;align-items:flex-start;padding:0 14px 12px;">
                <div style="flex:1;"></div>
                <div style="flex-shrink:0;width:260px;" id="rp-edit-fb-${esc(p.id)}">
                    ${_fretboardSVG(p.melody, root, pScaleKey)}
                </div>
            </div>
        </div>`;
    }

    // ── Toolbar HTML ──────────────────────────────────────────────────────────

    function _toolbarHtml() {
        const rootOptions = NOTE_NAMES.map(n =>
            `<option value="${n}" ${n === _state.root ? 'selected' : ''}>${n}</option>`
        ).join('');
        const scaleOptions = Object.entries(SCALES).map(([k, v]) =>
            `<option value="${k}" ${k === _state.scaleKey ? 'selected' : ''}>${esc(v.label)}</option>`
        ).join('');
        const timeSigOptions = ['2/4','3/4','4/4','6/8'].map(ts =>
            `<option value="${ts}" ${ts === _state.timeSig ? 'selected' : ''}>${ts}</option>`
        ).join('');
        return `
            <select class="form-select" id="ms-global-root" style="width:auto;">${rootOptions}</select>
            <select class="form-select" id="ms-global-scale" style="width:auto;">${scaleOptions}</select>
            <input type="number" class="form-input" id="ms-global-bpm"
                value="${_state.bpm}" min="20" max="300"
                style="width:68px;text-align:center;" title="BPM">
            <select class="form-select" id="ms-global-timesig" style="width:auto;" title="Fórmula de compasso">${timeSigOptions}</select>
        `;
    }

    // ── Component ─────────────────────────────────────────────────────────────
    const MelodicStudiesComponent = {

        render: function () {
            const C = MelodicStudiesComponent;
            const content = document.getElementById('main-content');
            const tabStyle = (active) =>
                `padding:7px 18px;border-radius:var(--radius-sm,6px);font-size:.85rem;cursor:pointer;` +
                `font-weight:${active ? '600' : '400'};` +
                `background:${active ? 'var(--brand-dim,rgba(124,58,237,.12))' : 'var(--glass-bg,rgba(255,255,255,.04))'};` +
                `border:1px solid ${active ? 'var(--brand,#7c3aed)' : 'var(--glass-border,rgba(255,255,255,.08))'};` +
                `color:${active ? 'var(--brand,#7c3aed)' : 'var(--text-secondary)'};`;

            content.innerHTML = `
                <div style="display:flex;gap:8px;margin-bottom:1.25rem;">
                    <button class="ms-tab" data-tab="exemplos" style="${tabStyle(_state.tab === 'exemplos')}">
                        <i class="fa-solid fa-book-open"></i> Exemplos
                    </button>
                    <button class="ms-tab" data-tab="repositorio" style="${tabStyle(_state.tab === 'repositorio')}">
                        <i class="fa-solid fa-folder-open"></i> Repositório
                    </button>
                </div>
                <div id="ms-tab-content"></div>
            `;

            document.querySelectorAll('.ms-tab').forEach(btn => {
                btn.addEventListener('click', e => {
                    _state.tab = e.currentTarget.dataset.tab;
                    C.render();
                });
            });

            if (_state.tab === 'exemplos') {
                C._renderExemplos();
            } else {
                C._renderRepositorio();
            }
        },

        // ── Exemplos tab ─────────────────────────────────────────────────────

        _renderExemplos: function () {
            const C = MelodicStudiesComponent;

            document.getElementById('ms-tab-content').innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-wave-square"></i></div>
                        <div>
                            <h2>Estudos Melódicos</h2>
                            <p>Baixarias e conduções funcionais — transponíveis em qualquer tom</p>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                        ${_toolbarHtml()}
                    </div>
                </div>
                <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:1.25rem;padding:8px 12px;
                    background:var(--bg-raised);border-radius:var(--radius-sm);border-left:3px solid var(--brand);">
                    <strong>Formato:</strong>
                    <code style="font-family:var(--font-mono);">grau(oitava):duração</code>
                    &nbsp;·&nbsp; Graus: <code>1 b2 2 b3 3 4 #4 5 b6 6 b7 7</code>
                    &nbsp;·&nbsp; Oitava: <code>(-1)</code>=grave <code>(0)</code>=base <code>(1)</code>=agudo
                    &nbsp;·&nbsp; Dur: <code>16n 8n 4n 2n 1n 8n. 4n.</code>
                    &nbsp;·&nbsp; Tercinas: <code>16t 8t 4t</code>
                    &nbsp;·&nbsp; Ligadura: <code>4n~</code> (une à próx.)
                    &nbsp;·&nbsp; Harm: <code>25(5) 5</code> — alvo auto-detectado de <code>5(X)</code>/<code>25(X)</code>
                    &nbsp;·&nbsp;
                    <span style="color:var(--brand,#7c3aed);">●</span> tônica
                    <span style="color:var(--chord-blue,#60a5fa);margin-left:6px;">●</span> diatônica
                    <span style="color:var(--chord-amber,#fbbf24);margin-left:6px;">●</span> cromática
                    <span style="color:var(--chord-red,#f87171);margin-left:6px;">●</span> fora do braço
                </div>
                <div id="ms-sections">${SECTIONS.map(_sectionHtml).join('')}</div>
            `;
            C._bindToolbarEvents();
            C._bindExemplosEvents();
        },

        _refreshAllNotes: function () {
            SECTIONS.forEach(sec => sec.studies.forEach(s => {
                const target = _detectTarget(_state.harmonies[s.id]);
                const ctx    = _effectiveContext(_state.root, _state.scaleKey, target);
                const el     = document.getElementById('ms-notes-' + s.id);
                if (el) el.innerHTML = _noteChips(_state.melodies[s.id], ctx.root, ctx.scaleKey);
                const fbEl = document.getElementById('ms-fb-' + s.id);
                if (fbEl) fbEl.innerHTML = _fretboardSVG(_state.melodies[s.id], ctx.root, ctx.scaleKey);
            }));
        },

        _setPlayingUI: function (sid, playing) {
            const btn = document.querySelector(`.ms-play-btn[data-sid="${sid}"]`);
            if (!btn) return;
            btn.innerHTML = `<i class="fa-solid fa-${playing ? 'stop' : 'guitar'}"></i>`;
            btn.className = `btn ${playing ? 'btn-secondary' : 'btn-primary'} ms-play-btn`;
        },

        _setPlayingAllUI: function (sid, playing) {
            const btn = document.querySelector(`.ms-play-all-btn[data-sid="${sid}"]`);
            if (!btn) return;
            btn.innerHTML = `<i class="fa-solid fa-${playing ? 'stop' : 'music'}"></i>`;
            btn.className = `btn ${playing ? 'btn-secondary' : 'btn-ghost'} ms-play-all-btn`;
        },

        _togglePlay: function (sid) {
            const C = MelodicStudiesComponent;
            if (_state.playing) {
                window.HMSAudio.stop();
                const prev = _state.playing;
                if (prev.endsWith('_all')) C._setPlayingAllUI(prev.slice(0, -4), false);
                else C._setPlayingUI(prev, false);
                const wasSame = prev === sid;
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
            C._setPlayingUI(sid, true);
            window.HMSAudio.playMelody(notes, _state.bpm, () => {
                _state.playing = null;
                C._setPlayingUI(sid, false);
            }, _state.timeSig);
        },

        _togglePlayAll: function (sid) {
            const C          = MelodicStudiesComponent;
            const playAllKey = sid + '_all';
            if (_state.playing) {
                window.HMSAudio.stop();
                const prev = _state.playing;
                if (prev.endsWith('_all')) C._setPlayingAllUI(prev.slice(0, -4), false);
                else C._setPlayingUI(prev, false);
                const wasSame = prev === playAllKey;
                _state.playing = null;
                if (wasSame) return;
            }
            const melodyStr  = _state.melodies[sid];
            const harmonyStr = _state.harmonies[sid] || '';
            if (!melodyStr || !melodyStr.trim()) {
                window.HMSApp.showToast('Campo de melodia vazio.', 'warning');
                return;
            }
            const parsed = window.MelodyEngine.parse(melodyStr);
            if (!parsed.length) {
                window.HMSApp.showToast('Não foi possível parsear a melodia.', 'warning');
                return;
            }
            const notes  = window.MelodyEngine.translate(parsed, _state.root);
            const tokens = harmonyStr.trim()
                ? window.HarmonyEngine.translate(harmonyStr, _state.root, _state.scaleKey !== 'major')
                : [];
            _state.playing = playAllKey;
            C._setPlayingAllUI(sid, true);
            window.HMSAudio.playAll(notes, tokens, _state.bpm, () => {
                _state.playing = null;
                C._setPlayingAllUI(sid, false);
            });
        },

        _bindToolbarEvents: function () {
            const C = MelodicStudiesComponent;
            const refresh = () => {
                if (_state.tab === 'exemplos') C._refreshAllNotes();
                else C._refreshRepositorioCards();
            };
            document.getElementById('ms-global-root')?.addEventListener('change', e => {
                _state.root = e.target.value;
                refresh();
            });
            document.getElementById('ms-global-scale')?.addEventListener('change', e => {
                _state.scaleKey = e.target.value;
                refresh();
            });
            document.getElementById('ms-global-bpm')?.addEventListener('change', e => {
                _state.bpm = Math.max(20, Math.min(300, parseInt(e.target.value) || 80));
                e.target.value = _state.bpm;
            });
            document.getElementById('ms-global-timesig')?.addEventListener('change', e => {
                _state.timeSig = e.target.value;
            });
        },

        _bindExemplosEvents: function () {
            const C = MelodicStudiesComponent;

            function _refreshStudyDisplay(sid) {
                const target = _detectTarget(_state.harmonies[sid]);
                const ctx    = _effectiveContext(_state.root, _state.scaleKey, target);
                const el     = document.getElementById('ms-notes-' + sid);
                if (el) el.innerHTML = _noteChips(_state.melodies[sid], ctx.root, ctx.scaleKey);
                const fbEl = document.getElementById('ms-fb-' + sid);
                if (fbEl) fbEl.innerHTML = _fretboardSVG(_state.melodies[sid], ctx.root, ctx.scaleKey);
                // Update alvo label in harmony row
                const span = document.querySelector(`.ms-harmony-input[data-sid="${sid}"]`)
                    ?.closest('div')?.querySelector('span');
                if (span) {
                    span.innerHTML = target
                        ? `Harm:<span style="color:var(--brand);margin-left:6px;">→ ${target}º</span>`
                        : 'Harm:';
                }
            }

            document.querySelectorAll('.ms-melody-input').forEach(inp => {
                inp.addEventListener('input', e => {
                    const sid = e.target.dataset.sid;
                    _state.melodies[sid] = e.target.value;
                    _refreshStudyDisplay(sid);
                });
            });
            document.querySelectorAll('.ms-harmony-input').forEach(inp => {
                inp.addEventListener('input', e => {
                    const sid = e.target.dataset.sid;
                    _state.harmonies[sid] = e.target.value;
                    _refreshStudyDisplay(sid);
                });
            });
            document.querySelectorAll('.ms-play-btn').forEach(btn => {
                btn.addEventListener('click', e => C._togglePlay(e.currentTarget.dataset.sid));
            });
            document.querySelectorAll('.ms-play-all-btn').forEach(btn => {
                btn.addEventListener('click', e => C._togglePlayAll(e.currentTarget.dataset.sid));
            });
        },

        // ── Repositório tab ──────────────────────────────────────────────────

        _renderRepositorio: function () {
            const C = MelodicStudiesComponent;

            document.getElementById('ms-tab-content').innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-folder-open"></i></div>
                        <div>
                            <h2>Repositório de Conduções</h2>
                            <p>Frases melódicas compartilhadas — toque em qualquer tom</p>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                        ${_toolbarHtml()}
                    </div>
                </div>
                <div style="margin-bottom:1rem;">
                    <button class="btn btn-primary" id="rp-btn-new">
                        <i class="fa-solid fa-plus"></i> Nova Condução
                    </button>
                </div>
                <div id="rp-new-form-container"></div>
                <div id="rp-list">
                    <div style="text-align:center;padding:2rem;color:var(--text-muted);">
                        <i class="fa-solid fa-spinner fa-spin"></i> Carregando…
                    </div>
                </div>
            `;

            C._bindToolbarEvents();

            document.getElementById('rp-btn-new').addEventListener('click', () => {
                _state.newForm = !_state.newForm;
                C._renderNewForm();
            });

            // Event delegation — covers play, edit, delete, save-edit, cancel-edit
            const listEl = document.getElementById('rp-list');
            listEl.addEventListener('click', e => {
                const play       = e.target.closest('.rp-play-btn');
                const edit       = e.target.closest('.rp-edit-btn');
                const del        = e.target.closest('.rp-del-btn');
                const saveEdit   = e.target.closest('.rp-save-edit-btn');
                const cancelEdit = e.target.closest('.rp-cancel-edit-btn');
                if (play)       C._togglePlayPhrase(play.dataset.id);
                if (edit)       { _state.editingId = edit.dataset.id; C._refreshPhraseCard(edit.dataset.id); }
                if (del)        C._deletePhrase(del.dataset.id);
                if (saveEdit)   C._updatePhrase(saveEdit.dataset.id);
                if (cancelEdit) { _state.editingId = null; C._refreshPhraseCard(cancelEdit.dataset.id); }
            });
            // Live preview in inline edit cards
            listEl.addEventListener('input', e => {
                const mel = e.target.closest('.rp-edit-melody');
                if (!mel) return;
                const id    = mel.dataset.id;
                const root  = document.getElementById('rp-edit-root-'  + id)?.value || _state.root;
                const scale = document.getElementById('rp-edit-scale-' + id)?.value || _state.scaleKey;
                const chips = document.getElementById('rp-edit-chips-' + id);
                const fb    = document.getElementById('rp-edit-fb-'    + id);
                if (chips) chips.innerHTML = _noteChips(mel.value, root, scale);
                if (fb)    fb.innerHTML    = _fretboardSVG(mel.value, root, scale);
            });
            listEl.addEventListener('change', e => {
                const isRoot  = e.target.id?.startsWith('rp-edit-root-');
                const isScale = e.target.id?.startsWith('rp-edit-scale-');
                if (!isRoot && !isScale) return;
                const id    = e.target.id.replace(/^rp-edit-(root|scale)-/, '');
                const mel   = document.getElementById('rp-edit-melody-' + id)?.value || '';
                const root  = document.getElementById('rp-edit-root-'   + id)?.value || _state.root;
                const scale = document.getElementById('rp-edit-scale-'  + id)?.value || _state.scaleKey;
                const chips = document.getElementById('rp-edit-chips-' + id);
                const fb    = document.getElementById('rp-edit-fb-'    + id);
                if (chips) chips.innerHTML = _noteChips(mel, root, scale);
                if (fb)    fb.innerHTML    = _fretboardSVG(mel, root, scale);
            });

            C._loadPhrases().then(() => C._renderPhraseList());
        },

        _loadPhrases: async function () {
            try {
                const user = await window.HMSAuth.currentUser();
                _state.currentUserId = user?.id || null;
                _state.phrases = await window.HMSAPI.MelodicPhrases.getAll();
            } catch (_e) {
                window.HMSApp.showToast('Erro ao carregar conduções.', 'error');
                _state.phrases = [];
            }
        },

        _renderPhraseList: function () {
            const listEl = document.getElementById('rp-list');
            if (!listEl) return;
            if (!_state.phrases.length) {
                listEl.innerHTML = `
                    <div style="text-align:center;padding:3rem;color:var(--text-muted);">
                        <i class="fa-solid fa-music" style="font-size:2rem;opacity:.3;display:block;margin-bottom:.75rem;"></i>
                        Nenhuma condução salva ainda. Seja o primeiro!
                    </div>`;
                return;
            }
            listEl.innerHTML = _state.phrases.map(p =>
                _state.editingId === p.id ? _phraseCardEditHtml(p) : _phraseCardHtml(p)
            ).join('');
        },

        _refreshPhraseCard: function (id) {
            const card   = document.getElementById('rp-card-' + id);
            if (!card) return;
            const phrase = _state.phrases.find(p => p.id === id);
            if (!phrase) return;
            const tmp = document.createElement('div');
            tmp.innerHTML = _state.editingId === id ? _phraseCardEditHtml(phrase) : _phraseCardHtml(phrase);
            card.replaceWith(tmp.firstElementChild);
        },

        _renderNewForm: function () {
            const C = MelodicStudiesComponent;
            const container = document.getElementById('rp-new-form-container');
            if (!container) return;
            if (!_state.newForm) { container.innerHTML = ''; return; }

            const rootOptions = NOTE_NAMES.map(n =>
                `<option value="${n}" ${n === _state.root ? 'selected' : ''}>${n}</option>`
            ).join('');
            const scaleOptions = Object.entries(SCALES).map(([k, v]) =>
                `<option value="${k}" ${k === _state.scaleKey ? 'selected' : ''}>${esc(v.label)}</option>`
            ).join('');

            container.innerHTML = `
            <div class="panel" style="margin-bottom:1.25rem;border:1px solid var(--brand,#7c3aed);">
                <div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;">
                    <div style="display:flex;gap:8px;">
                        <input type="text" class="form-input" id="rp-title" placeholder="Título*" style="flex:1;" />
                        <input type="text" class="form-input" id="rp-desc"  placeholder="Descrição" style="flex:2;" />
                    </div>
                    <input type="text" class="form-input" id="rp-melody"
                        placeholder="ex: 1:4n 2:4n b3:4n 4:4n"
                        style="font-family:var(--font-mono);font-size:.8rem;" />
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <select class="form-select" id="rp-root" style="width:auto;">${rootOptions}</select>
                        <select class="form-select" id="rp-scale" style="width:auto;">${scaleOptions}</select>
                        <input type="number" class="form-input" id="rp-bpm" value="${_state.bpm}"
                            min="20" max="300" style="width:68px;text-align:center;" title="BPM" />
                        <div style="flex:1;min-width:100px;display:flex;align-items:center;flex-wrap:wrap;gap:4px;min-height:36px;"
                            id="rp-new-chips"></div>
                    </div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;">
                        <button class="btn btn-secondary" id="rp-cancel-new">Cancelar</button>
                        <button class="btn btn-primary"   id="rp-save-new">
                            <i class="fa-solid fa-check"></i> Salvar Condução
                        </button>
                    </div>
                </div>
                <div style="display:flex;gap:14px;align-items:flex-start;padding:0 14px 12px;">
                    <div style="flex:1;"></div>
                    <div style="flex-shrink:0;width:260px;" id="rp-new-fb"></div>
                </div>
            </div>`;

            const updateNewPreview = () => {
                const mel   = document.getElementById('rp-melody').value;
                const root  = document.getElementById('rp-root').value;
                const scale = document.getElementById('rp-scale').value;
                document.getElementById('rp-new-chips').innerHTML = _noteChips(mel, root, scale);
                document.getElementById('rp-new-fb').innerHTML    = _fretboardSVG(mel, root, scale);
            };
            document.getElementById('rp-melody').addEventListener('input',  updateNewPreview);
            document.getElementById('rp-root').addEventListener('change',   updateNewPreview);
            document.getElementById('rp-scale').addEventListener('change',  updateNewPreview);
            document.getElementById('rp-cancel-new').addEventListener('click', () => {
                _state.newForm = false;
                C._renderNewForm();
            });
            document.getElementById('rp-save-new').addEventListener('click', () => C._saveNewPhrase());
        },

        _saveNewPhrase: async function () {
            const C     = MelodicStudiesComponent;
            const title    = (document.getElementById('rp-title')?.value  || '').trim();
            const desc     = (document.getElementById('rp-desc')?.value   || '').trim();
            const melody   = (document.getElementById('rp-melody')?.value || '').trim();
            const root     = document.getElementById('rp-root')?.value    || 'C';
            const scaleKey = document.getElementById('rp-scale')?.value   || _state.scaleKey;
            const bpm      = parseInt(document.getElementById('rp-bpm')?.value) || 80;
            if (!title)  { window.HMSApp.showToast('Título obrigatório.', 'warning');  return; }
            if (!melody) { window.HMSApp.showToast('Melodia obrigatória.', 'warning'); return; }
            try {
                const saved = await window.HMSAPI.MelodicPhrases.create({ title, description: desc, melody, root, scale_key: scaleKey, bpm });
                _state.phrases.unshift(saved);
                _state.newForm = false;
                C._renderNewForm();
                C._renderPhraseList();
                window.HMSApp.showToast('Condução salva!', 'success');
            } catch (e) {
                window.HMSApp.showToast('Erro ao salvar: ' + (e.message || e), 'error');
            }
        },

        _updatePhrase: async function (id) {
            const C      = MelodicStudiesComponent;
            const title    = (document.getElementById('rp-edit-title-'  + id)?.value || '').trim();
            const desc     = (document.getElementById('rp-edit-desc-'   + id)?.value || '').trim();
            const melody   = (document.getElementById('rp-edit-melody-' + id)?.value || '').trim();
            const root     = document.getElementById('rp-edit-root-'  + id)?.value || 'C';
            const scaleKey = document.getElementById('rp-edit-scale-' + id)?.value || 'major';
            const bpm      = parseInt(document.getElementById('rp-edit-bpm-' + id)?.value) || 80;
            if (!title)  { window.HMSApp.showToast('Título obrigatório.', 'warning');  return; }
            if (!melody) { window.HMSApp.showToast('Melodia obrigatória.', 'warning'); return; }
            try {
                const updated = await window.HMSAPI.MelodicPhrases.update(id, { title, description: desc, melody, root, scale_key: scaleKey, bpm });
                const idx = _state.phrases.findIndex(p => p.id === id);
                if (idx !== -1) _state.phrases[idx] = updated;
                _state.editingId = null;
                C._refreshPhraseCard(id);
                window.HMSApp.showToast('Condução atualizada!', 'success');
            } catch (e) {
                window.HMSApp.showToast('Erro ao atualizar: ' + (e.message || e), 'error');
            }
        },

        _deletePhrase: async function (id) {
            if (!confirm('Deletar esta condução?')) return;
            try {
                await window.HMSAPI.MelodicPhrases.delete(id);
                _state.phrases = _state.phrases.filter(p => p.id !== id);
                document.getElementById('rp-card-' + id)?.remove();
                if (!_state.phrases.length) MelodicStudiesComponent._renderPhraseList();
                window.HMSApp.showToast('Condução removida.', 'success');
            } catch (e) {
                window.HMSApp.showToast('Erro ao deletar: ' + (e.message || e), 'error');
            }
        },

        _togglePlayPhrase: function (id) {
            const C       = MelodicStudiesComponent;
            const playKey = 'rp_' + id;
            if (_state.playing) {
                window.HMSAudio.stop();
                const prevId = _state.playing.startsWith('rp_') ? _state.playing.slice(3) : null;
                if (prevId) {
                    const btn = document.querySelector(`.rp-play-btn[data-id="${prevId}"]`);
                    if (btn) { btn.innerHTML = '<i class="fa-solid fa-play"></i>'; btn.className = 'btn btn-primary rp-play-btn'; }
                } else {
                    C._setPlayingUI(_state.playing, false);
                }
                const wasSame = _state.playing === playKey;
                _state.playing = null;
                if (wasSame) return;
            }
            const phrase = _state.phrases.find(p => p.id === id);
            if (!phrase) return;
            const root = phrase.root || _state.root;
            const bpm  = phrase.bpm  || _state.bpm;
            const parsed = window.MelodyEngine.parse(phrase.melody);
            if (!parsed.length) { window.HMSApp.showToast('Melodia inválida.', 'warning'); return; }
            const notes = window.MelodyEngine.translate(parsed, root);
            _state.playing = playKey;
            const playBtn = document.querySelector(`.rp-play-btn[data-id="${id}"]`);
            if (playBtn) { playBtn.innerHTML = '<i class="fa-solid fa-stop"></i>'; playBtn.className = 'btn btn-secondary rp-play-btn'; }
            window.HMSAudio.playMelody(notes, bpm, () => {
                _state.playing = null;
                const btn = document.querySelector(`.rp-play-btn[data-id="${id}"]`);
                if (btn) { btn.innerHTML = '<i class="fa-solid fa-play"></i>'; btn.className = 'btn btn-primary rp-play-btn'; }
            }, _state.timeSig);
        },

        _refreshRepositorioCards: function () {
            _state.phrases.forEach(p => {
                if (_state.editingId === p.id) return;
                const card = document.getElementById('rp-card-' + p.id);
                if (!card) return;
                const tmp = document.createElement('div');
                tmp.innerHTML = _phraseCardHtml(p);
                card.replaceWith(tmp.firstElementChild);
            });
        },
    };

    window.MelodicStudiesComponent = MelodicStudiesComponent;
    console.info('[HMS] MelodicStudiesComponent loaded.');
})();
