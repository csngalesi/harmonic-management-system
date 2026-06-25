/**
 * HMS — Braço 7 Cordas Component
 * Visualiza graus funcionais no braço de violão de 7 cordas (5 casas).
 * Modos: Escalas (graus da escala) e Arpejo (notas da tríade/tétrade).
 * Exposed via window.Fretboard7Component
 */
(function () {
    'use strict';

    const esc        = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const NOTE_NAMES  = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const FLAT_NAMES  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    const NOTE_LABELS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

    // Afinação: string 0 = mais grave (C) em cima, string 6 = mais aguda (E4) embaixo
    const OPEN_NOTES    = [0, 4, 9, 2, 7, 11, 4]; // C E A D G B E  (pitch class)
    const OPEN_MIDI     = [36, 40, 45, 50, 55, 59, 64]; // C2 E2 A2 D3 G3 B3 E4
    const STRING_LABELS = ['C','E','A','D','G','B','E'];

    // ── Escalas ───────────────────────────────────────────────────────────────
    const SCALES = {
        major:     { label: 'Maior',           intervals: [0, 2, 4, 5, 7, 9, 11] },
        nat_minor: { label: 'Menor Natural',    intervals: [0, 2, 3, 5, 7, 8, 10] },
        har_minor: { label: 'Menor Harmônica',  intervals: [0, 2, 3, 5, 7, 8, 11] },
        mel_minor: { label: 'Menor Melódica',   intervals: [0, 2, 3, 5, 7, 9, 11] },
    };

    // ── Arpejos — intervalos em semitons a partir da tônica ──────────────────
    const ARPEGGIOS = {
        'M':  { label: 'Maior (M)',          intervals: [0, 4, 7],      toneLabels: ['1','2','3'],     intervalLabels: ['','3ª M','5ª J'] },
        'm':  { label: 'Menor (m)',          intervals: [0, 3, 7],      toneLabels: ['1','2','3'],     intervalLabels: ['','3ª m','5ª J'] },
        '7':  { label: 'Dominante 7ª (7)',   intervals: [0, 4, 7, 10],  toneLabels: ['1','2','3','4'], intervalLabels: ['','3ª M','5ª J','7ª m'] },
        'o':  { label: 'Diminuto (o)',       intervals: [0, 3, 6, 9],   toneLabels: ['1','2','3','4'], intervalLabels: ['','3ª m','5ª d','7ª d'] },
        'h':  { label: 'Meio-dim. (h)',      intervals: [0, 3, 6, 10],  toneLabels: ['1','2','3','4'], intervalLabels: ['','3ª m','5ª d','7ª m'] },
        '7M': { label: 'Maior 7ª (7M)',      intervals: [0, 4, 7, 11],  toneLabels: ['1','2','3','4'], intervalLabels: ['','3ª M','5ª J','7ª M'] },
        'm7': { label: 'Menor 7ª (m7)',      intervals: [0, 3, 7, 10],  toneLabels: ['1','2','3','4'], intervalLabels: ['','3ª m','5ª J','7ª m'] },
    };

    // Cores pedagógicas por grau: 1=vermelho 2=amarelo 3=verde 4=marrom 5=azul 6=rosa 7=preto
    const DEGREE_COLORS = [
        null,        // índice 0 não usado
        '#dc2626',   // 1 – vermelho
        '#ca8a04',   // 2 – amarelo-dourado
        '#16a34a',   // 3 – verde
        '#78350f',   // 4 – marrom
        '#2563eb',   // 5 – azul
        '#ff00cc',   // 6 – rosa (hot pink "cheguei")
        '#1f2937',   // 7 – preto (cinza-escuro p/ visibilidade)
    ];

    // Cor para tom de arpejo (índice 0-3 → graus 1,2,3,4 → cores 1,2,3,4)
    function arpColor(toneIdx) { return DEGREE_COLORS[toneIdx + 1] || DEGREE_COLORS[1]; }


    // Usar bemóis para chaves que os preferem
    const FLAT_PREF = new Set(['F','Bb','Eb','Ab','Db','Gb','Dm','Gm','Cm','Fm','Bbm','Ebm']);

    function _noteName(pc, root) {
        const useFlats = FLAT_PREF.has(root);
        return useFlats ? FLAT_NAMES[((pc % 12) + 12) % 12] : NOTE_NAMES[((pc % 12) + 12) % 12];
    }

    const _state = {
        mode:         'scale',   // 'scale' | 'arpeggio'
        root:         'C',
        scaleKey:     'major',
        degreesInput: '1 2 3 4 5 6 7',
        arpQuality:   'M',
        highlights:   [],
    };

    // ── Fretboard SVG ─────────────────────────────────────────────────────────
    const FB = {
        W:            600,
        H:            250,
        marginLeft:   38,
        marginRight:  16,
        marginTop:    18,
        marginBottom: 44,
        FRETS:        5,
        STRINGS:      7,
        get neckW()        { return this.W - this.marginLeft - this.marginRight; },
        get fretSpacing()  { return this.neckW / this.FRETS; },
        get stringSpacing(){ return (this.H - this.marginTop - this.marginBottom) / (this.STRINGS - 1); },
        stringY(s)         { return this.marginTop + s * this.stringSpacing; },
        dotX(fret)         {
            if (fret === 0) return this.marginLeft - 14;
            return this.marginLeft + (fret - 0.5) * this.fretSpacing;
        },
    };

    // ── Highlight resolvers ───────────────────────────────────────────────────

    function _resolveHighlights(root, scaleKey, degreesStr) {
        const rootIdx   = NOTE_NAMES.indexOf(root);
        if (rootIdx === -1) return [];
        const intervals = SCALES[scaleKey].intervals;
        const degrees   = degreesStr.split(/[\s,]+/)
            .map(d => parseInt(d, 10))
            .filter(d => d >= 1 && d <= 7);
        if (!degrees.length) return [];

        const degToPc = {};
        for (const d of degrees) degToPc[d] = (rootIdx + intervals[d - 1]) % 12;

        const candidates = [];
        for (let s = 0; s < 7; s++) {
            for (let f = 0; f <= FB.FRETS; f++) {
                const pc   = (OPEN_NOTES[s] + f) % 12;
                const midi = OPEN_MIDI[s] + f;
                for (const d of degrees) {
                    if (pc === degToPc[d]) {
                        candidates.push({ string: s, fret: f, degree: d, isRoot: d === 1, midi,
                                          noteName: _noteName(pc, root) });
                        break;
                    }
                }
            }
        }

        candidates.sort((a, b) => a.fret - b.fret || a.string - b.string);
        const seen = new Set();
        const hits = [];
        for (const c of candidates) {
            if (!seen.has(c.midi)) { seen.add(c.midi); hits.push(c); }
        }
        return hits;
    }

    function _resolveArpHighlights(root, quality) {
        const rootIdx  = NOTE_NAMES.indexOf(root);
        if (rootIdx === -1) return [];
        const arp = ARPEGGIOS[quality];
        if (!arp) return [];

        // Build pitch-class → chord tone index (1-based)
        const pcToTone = {};
        arp.intervals.forEach((semis, i) => {
            pcToTone[(rootIdx + semis) % 12] = i; // 0-based index
        });

        const candidates = [];
        for (let s = 0; s < 7; s++) {
            for (let f = 0; f <= FB.FRETS; f++) {
                const pc   = (OPEN_NOTES[s] + f) % 12;
                const midi = OPEN_MIDI[s] + f;
                if (pc in pcToTone) {
                    const toneIdx = pcToTone[pc];
                    candidates.push({
                        string:   s,
                        fret:     f,
                        degree:   arp.toneLabels[toneIdx],  // '1','2','3','4'
                        isRoot:   toneIdx === 0,
                        toneIdx,
                        midi,
                        noteName: _noteName(pc, root),
                    });
                }
            }
        }

        candidates.sort((a, b) => a.fret - b.fret || a.string - b.string);
        const seen = new Set();
        const hits = [];
        for (const c of candidates) {
            if (!seen.has(c.midi)) { seen.add(c.midi); hits.push(c); }
        }
        return hits;
    }

    // ── SVG Builder ───────────────────────────────────────────────────────────

    function _buildSVG(highlights, isArp) {
        const { W, H, marginLeft, marginTop, marginBottom, FRETS, STRINGS,
                neckW, fretSpacing, stringSpacing } = FB;
        const nutX    = marginLeft;
        const neckEnd = nutX + neckW;
        const topY    = marginTop;
        const botY    = H - marginBottom;

        const parts = [];
        parts.push(`<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">`);

        // Neck background
        parts.push(`<rect x="${nutX}" y="${topY - 4}" width="${neckW}" height="${botY - topY + 8}" fill="var(--bg-raised)" rx="3" opacity="0.4"/>`);

        // Position markers at frets 3 and 5
        for (const mf of [3, 5]) {
            const mx = nutX + (mf - 0.5) * fretSpacing;
            const my = topY + (STRINGS - 1) * stringSpacing / 2;
            parts.push(`<circle cx="${mx}" cy="${my}" r="5" fill="var(--text-muted)" opacity="0.2"/>`);
        }

        // Strings
        for (let s = 0; s < STRINGS; s++) {
            const y  = FB.stringY(s);
            const sw = (0.6 + (STRINGS - 1 - s) * 0.25).toFixed(2);
            parts.push(`<line x1="${nutX}" y1="${y}" x2="${neckEnd}" y2="${y}" stroke="var(--text-secondary)" stroke-width="${sw}" opacity="0.7"/>`);
            parts.push(`<text x="${nutX - 8}" y="${y + 4}" text-anchor="end" font-size="11" font-family="var(--font-mono)" fill="var(--text-muted)">${STRING_LABELS[s]}</text>`);
        }

        // Nut
        parts.push(`<line x1="${nutX}" y1="${topY - 6}" x2="${nutX}" y2="${botY + 6}" stroke="var(--text-primary)" stroke-width="3" stroke-linecap="round"/>`);

        // Fret bars + numbers
        for (let f = 1; f <= FRETS; f++) {
            const x = nutX + f * fretSpacing;
            parts.push(`<line x1="${x}" y1="${topY - 4}" x2="${x}" y2="${botY + 4}" stroke="var(--line-color)" stroke-width="1.2"/>`);
            parts.push(`<text x="${x - fretSpacing / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${f}</text>`);
        }

        // Highlight dots
        for (const h of highlights) {
            const cx   = FB.dotX(h.fret);
            const cy   = FB.stringY(h.string);

            // Cor: sempre pela paleta de graus (1-7 para escalas, tom 1-4 para arpejos)
            const degIdx = isArp ? (h.toneIdx + 1) : h.degree;
            const fill   = DEGREE_COLORS[degIdx] || DEGREE_COLORS[1];
            // Preto (grau 7) em fundo aberto precisa de stroke
            const isBlack = fill === DEGREE_COLORS[7];

            if (h.fret === 0) {
                parts.push(`<circle cx="${cx}" cy="${cy}" r="10" fill="none" stroke="${fill}" stroke-width="2"/>`);
                parts.push(`<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="9" font-weight="700" fill="${fill}">${h.degree}</text>`);
            } else {
                parts.push(`<circle cx="${cx}" cy="${cy}" r="10" fill="${fill}" opacity="0.95"/>`);
                const txtColor = isBlack ? '#e5e7eb' : 'white';
                parts.push(`<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="10" font-weight="700" fill="${txtColor}">${h.degree}</text>`);
            }
            parts.push(`<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="7.5" font-weight="600" fill="${fill}" opacity="0.9">${h.noteName}</text>`);
        }

        parts.push(`</svg>`);
        return parts.join('');
    }

    // ── HTML Builders ─────────────────────────────────────────────────────────

    function _tabBar() {
        const active = 'background:var(--brand,#7c3aed);color:#fff;border-color:var(--brand,#7c3aed);';
        const inactive = 'background:var(--bg-raised);color:var(--text-secondary);border-color:var(--line-color);';
        return `
        <div style="display:flex;gap:8px;margin-bottom:20px;">
            <button id="fb7-tab-scale" style="
                flex:1;padding:9px 16px;border-radius:10px;border:1.5px solid;
                font-size:.85rem;font-weight:600;cursor:pointer;transition:all .18s;
                ${_state.mode === 'scale' ? active : inactive}">
                <i class="fa-solid fa-music"></i> Escalas
            </button>
            <button id="fb7-tab-arp" style="
                flex:1;padding:9px 16px;border-radius:10px;border:1.5px solid;
                font-size:.85rem;font-weight:600;cursor:pointer;transition:all .18s;
                ${_state.mode === 'arpeggio' ? active : inactive}">
                <i class="fa-solid fa-layer-group"></i> Arpejo
            </button>
        </div>`;
    }

    function _controlsScale(rootOptions, scaleOptions) {
        return `
        <div id="fb7-panel-scale">
            <div class="form-group">
                <label class="form-label">Tom</label>
                <select id="fb7-root" class="form-input form-select">${rootOptions}</select>
            </div>
            <div class="form-group">
                <label class="form-label">Escala</label>
                <select id="fb7-scale" class="form-input form-select">${scaleOptions}</select>
            </div>
            <div class="form-group">
                <label class="form-label">Graus</label>
                <input type="text" id="fb7-degrees" class="form-input"
                    value="${esc(_state.degreesInput)}"
                    placeholder="Ex: 1 3 5  ou  1 2 3 4 5 6 7" />
                <span class="form-hint">Números 1–7 separados por espaço</span>
            </div>
            <button class="btn btn-primary btn-full" id="btn-fb7-apply">
                <i class="fa-solid fa-wand-magic-sparkles"></i> Visualizar
            </button>

            <!-- Legend -->
            <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--line-color);">
                <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px;">Legenda</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    ${[1,2,3,4,5,6,7].map(d => `
                    <div style="display:flex;align-items:center;gap:10px;">
                        <svg width="22" height="22"><circle cx="11" cy="11" r="10" fill="${DEGREE_COLORS[d]}"/><text x="11" y="15" text-anchor="middle" font-size="10" font-weight="700" fill="${d===7?'#e5e7eb':'white'}">${d}</text></svg>
                        <span style="font-size:.82rem;color:var(--text-secondary);">Grau ${d}</span>
                    </div>`).join('')}
                </div>
            </div>
            <div id="fb7-notes-list"></div>
        </div>`;
    }

    function _controlsArp(rootOptions) {
        const arpOptions = Object.entries(ARPEGGIOS).map(([k, v]) =>
            `<option value="${k}" ${k === _state.arpQuality ? 'selected' : ''}>${esc(v.label)}</option>`
        ).join('');

        const arpColors = DEGREE_COLORS;
        const arpLabels = ['Tônica', 'Terça', 'Quinta', 'Sétima'];

        const legendItems = Object.entries(ARPEGGIOS).find(([k]) => k === _state.arpQuality)?.[1]
            ?.toneLabels.map((l, i) =>
                `<div style="display:flex;align-items:center;gap:10px;">
                    <svg width="22" height="22"><circle cx="11" cy="11" r="10" fill="${arpColors[i+1]}"/><text x="11" y="15" text-anchor="middle" font-size="10" font-weight="700" fill="${i+1===7?'#e5e7eb':'white'}">${l}</text></svg>
                    <span style="font-size:.82rem;color:var(--text-secondary);">${arpLabels[i]}</span>
                </div>`
            ).join('') || '';

        return `
        <div id="fb7-panel-arp">
            <div class="form-group">
                <label class="form-label">Tom</label>
                <select id="fb7-arp-root" class="form-input form-select">${rootOptions}</select>
            </div>
            <div class="form-group">
                <label class="form-label">Qualidade</label>
                <select id="fb7-arp-quality" class="form-input form-select">${arpOptions}</select>
            </div>

            <!-- Legend -->
            <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--line-color);">
                <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px;">Legenda</div>
                <div id="fb7-arp-legend" style="display:flex;flex-direction:column;gap:8px;">
                    ${legendItems}
                </div>
            </div>
            <div id="fb7-arp-notes"></div>
        </div>`;
    }

    // ── Component ─────────────────────────────────────────────────────────────
    const Fretboard7Component = {

        render: function () {
            const content = document.getElementById('main-content');

            const rootOptions = NOTE_LABELS.map(n =>
                `<option value="${n}" ${n === _state.root ? 'selected' : ''}>${n}</option>`
            ).join('');

            const scaleOptions = Object.entries(SCALES).map(([k, v]) =>
                `<option value="${k}" ${k === _state.scaleKey ? 'selected' : ''}>${esc(v.label)}</option>`
            ).join('');

            content.innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-guitar"></i></div>
                        <div>
                            <h2>Braço 7 Cordas</h2>
                            <p>Visualize graus funcionais no braço do violão</p>
                        </div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 240px;gap:20px;align-items:start;" id="fb7-grid">

                    <!-- Fretboard panel -->
                    <div class="panel">
                        <div class="panel-header">
                            <span class="panel-title"><i class="fa-solid fa-music"></i> Braço (5 casas)</span>
                        </div>
                        <div class="panel-body" style="padding:20px 14px 12px;">
                            <div id="fretboard-svg"></div>
                        </div>
                    </div>

                    <!-- Controls panel -->
                    <div class="panel">
                        <div class="panel-header">
                            <span class="panel-title"><i class="fa-solid fa-sliders"></i> Configuração</span>
                        </div>
                        <div class="panel-body">
                            ${_tabBar()}
                            ${_controlsScale(rootOptions, scaleOptions)}
                            ${_controlsArp(rootOptions)}
                        </div>
                    </div>

                </div>
            `;

            if (window.innerWidth <= 768) {
                document.getElementById('fb7-grid').style.gridTemplateColumns = '1fr';
            }

            // Show correct panel
            Fretboard7Component._showMode(_state.mode);

            // Tab buttons
            document.getElementById('fb7-tab-scale').addEventListener('click', () => {
                _state.mode = 'scale';
                Fretboard7Component.render();
            });
            document.getElementById('fb7-tab-arp').addEventListener('click', () => {
                _state.mode = 'arpeggio';
                Fretboard7Component.render();
            });

            // Scale controls
            document.getElementById('btn-fb7-apply')?.addEventListener('click', () => Fretboard7Component._applyScale());
            document.getElementById('fb7-root')?.addEventListener('change', () => Fretboard7Component._applyScale());
            document.getElementById('fb7-scale')?.addEventListener('change', () => Fretboard7Component._applyScale());
            document.getElementById('fb7-degrees')?.addEventListener('keydown', e => {
                if (e.key === 'Enter') Fretboard7Component._applyScale();
            });

            // Arpeggio controls
            document.getElementById('fb7-arp-root')?.addEventListener('change', () => Fretboard7Component._applyArp());
            document.getElementById('fb7-arp-quality')?.addEventListener('change', () => Fretboard7Component._applyArp());

            // Initial draw
            if (_state.mode === 'scale') Fretboard7Component._applyScale();
            else Fretboard7Component._applyArp();
        },

        _showMode: function (mode) {
            const scaleEl = document.getElementById('fb7-panel-scale');
            const arpEl   = document.getElementById('fb7-panel-arp');
            if (scaleEl) scaleEl.style.display = mode === 'scale'    ? 'block' : 'none';
            if (arpEl)   arpEl.style.display   = mode === 'arpeggio' ? 'block' : 'none';
        },

        _applyScale: function () {
            const root     = document.getElementById('fb7-root').value;
            const scaleKey = document.getElementById('fb7-scale').value;
            const degStr   = (document.getElementById('fb7-degrees').value || '1 2 3 4 5 6 7').trim();

            _state.root         = root;
            _state.scaleKey     = scaleKey;
            _state.degreesInput = degStr;

            _state.highlights = _resolveHighlights(root, scaleKey, degStr);

            const svgEl = document.getElementById('fretboard-svg');
            if (svgEl) svgEl.innerHTML = _buildSVG(_state.highlights, false);

            // Notes table
            const listEl = document.getElementById('fb7-notes-list');
            if (!listEl) return;

            const rootIdx   = NOTE_NAMES.indexOf(root);
            const intervals = SCALES[scaleKey].intervals;
            const degrees   = degStr.split(/[\s,]+/).map(d => parseInt(d, 10)).filter(d => d >= 1 && d <= 7);

            if (!degrees.length || rootIdx === -1) { listEl.innerHTML = ''; return; }

            const rows = degrees.map(d => {
                const pc    = (rootIdx + intervals[d - 1]) % 12;
                const color = d === 1 ? 'var(--brand,#7c3aed)' : 'var(--chord-blue,#60a5fa)';
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--line-color);">
                    <span style="font-size:.8rem;color:var(--text-muted);">Grau ${d}</span>
                    <span style="font-family:var(--font-mono);font-size:.9rem;font-weight:600;color:${color};">${_noteName(pc, root)}</span>
                </div>`;
            }).join('');

            listEl.innerHTML = `<div style="margin-top:16px;padding-top:4px;">${rows}</div>`;
        },

        _applyArp: function () {
            const root    = document.getElementById('fb7-arp-root').value;
            const quality = document.getElementById('fb7-arp-quality').value;

            _state.root       = root;
            _state.arpQuality = quality;

            _state.highlights = _resolveArpHighlights(root, quality);

            const svgEl = document.getElementById('fretboard-svg');
            if (svgEl) svgEl.innerHTML = _buildSVG(_state.highlights, true);

            // Notes table
            const notesEl = document.getElementById('fb7-arp-notes');
            if (!notesEl) return;

            const arp     = ARPEGGIOS[quality];
            const rootIdx = NOTE_NAMES.indexOf(root);
            if (!arp || rootIdx === -1) { notesEl.innerHTML = ''; return; }

            const arpLabels = ['Tônica', 'Terça', 'Quinta', 'Sétima'];

            const rows = arp.intervals.map((semis, i) => {
                const pc    = (rootIdx + semis) % 12;
                const color = DEGREE_COLORS[i + 1];
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--line-color);">
                    <span style="font-size:.8rem;color:var(--text-muted);">${arp.toneLabels[i]} – ${arpLabels[i]}</span>
                    <span style="font-family:var(--font-mono);font-size:.9rem;font-weight:600;color:${color};">${_noteName(pc, root)}</span>
                </div>`;
            }).join('');

            notesEl.innerHTML = `<div style="margin-top:16px;padding-top:4px;">${rows}</div>`;

            // Update legend with note names + interval quality inline
            const legendEl = document.getElementById('fb7-arp-legend');
            if (legendEl) {
                legendEl.innerHTML = arp.toneLabels.map((l, i) => {
                    const pc          = (rootIdx + arp.intervals[i]) % 12;
                    const noteName    = _noteName(pc, root);
                    const color       = DEGREE_COLORS[i + 1];
                    const intLabel    = (arp.intervalLabels || [])[i] || '';
                    const badge       = intLabel
                        ? `<span style="font-size:.68rem;color:var(--text-muted);background:var(--bg-raised);border:1px solid var(--line-color);border-radius:4px;padding:1px 5px;white-space:nowrap;">${intLabel}</span>`
                        : '';
                    return `<div style="display:flex;align-items:center;gap:8px;">
                        <svg width="22" height="22"><circle cx="11" cy="11" r="10" fill="${color}"/><text x="11" y="15" text-anchor="middle" font-size="10" font-weight="700" fill="white">${l}</text></svg>
                        <span style="font-size:.82rem;color:var(--text-secondary);">${arpLabels[i]}</span>
                        ${badge}
                        <span style="flex:1;"></span>
                        <span style="font-family:var(--font-mono);font-size:.95rem;font-weight:700;color:${color};">${noteName}</span>
                    </div>`;
                }).join('');
            }

            // Clear old separate notes table (now integrated into legend)
            notesEl.innerHTML = '';
        },
    };

    window.Fretboard7Component = Fretboard7Component;
    console.info('[HMS] Fretboard7Component loaded.');
})();
