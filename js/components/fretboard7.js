/**
 * HMS — Braço 7 Cordas Component
 * Visualiza graus funcionais no braço de violão de 7 cordas (5 casas).
 * Exposed via window.Fretboard7Component
 */
(function () {
    'use strict';

    const KEYS      = window.HarmonyEngine.allKeys();
    const esc       = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

    // Afinação padrão 7 cordas: string 0 = mais aguda (E4), string 6 = mais grave (B1)
    const OPEN_NOTES    = [4, 11, 7, 2, 9, 4, 0]; // E B G D A E C
    const STRING_LABELS = ['E','B','G','D','A','E','C'];

    const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
    const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

    const _state = {
        key:         'C',
        isMinor:     false,
        degreesInput: '1 3 5',
        highlights:  [],
    };

    // ── Fretboard SVG ─────────────────────────────────────────────────────────
    const FB = {
        W:            600,
        H:            220,
        marginLeft:   38,
        marginRight:  16,
        marginTop:    18,
        marginBottom: 28,
        FRETS:        5,
        STRINGS:      7,
        get neckW()        { return this.W - this.marginLeft - this.marginRight; },
        get fretSpacing()  { return this.neckW / this.FRETS; },
        get stringSpacing(){ return (this.H - this.marginTop - this.marginBottom) / (this.STRINGS - 1); },
        stringY(s)         { return this.marginTop + s * this.stringSpacing; },
        fretX(f)           { return this.marginLeft + f * this.fretSpacing; },
        // Center x between two fret bars (for note dot placement)
        dotX(fret)         {
            if (fret === 0) return this.marginLeft - 14; // open string: left of nut
            return this.marginLeft + (fret - 0.5) * this.fretSpacing;
        },
    };

    function _resolveHighlights(key, isMinor, degreesStr) {
        const rootIdx = NOTE_NAMES.indexOf(key);
        if (rootIdx === -1) return [];

        const intervals = isMinor ? MINOR_INTERVALS : MAJOR_INTERVALS;
        const degrees   = degreesStr.split(/[\s,]+/)
            .map(d => parseInt(d, 10))
            .filter(d => d >= 1 && d <= 7);
        if (!degrees.length) return [];

        const degToPc = {};
        for (const d of degrees) degToPc[d] = (rootIdx + intervals[d - 1]) % 12;

        const hits = [];
        for (let s = 0; s < 7; s++) {
            for (let f = 0; f <= FB.FRETS; f++) {
                const pc = (OPEN_NOTES[s] + f) % 12;
                for (const d of degrees) {
                    if (pc === degToPc[d]) {
                        hits.push({ string: s, fret: f, degree: d, isRoot: d === 1 });
                    }
                }
            }
        }
        return hits;
    }

    function _buildSVG(highlights) {
        const { W, H, marginLeft, marginTop, marginBottom, marginRight, FRETS, STRINGS,
                neckW, fretSpacing, stringSpacing } = FB;
        const nutX    = marginLeft;
        const neckEnd = nutX + neckW;
        const topY    = marginTop;
        const botY    = H - marginBottom;

        const parts = [];
        parts.push(`<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">`);

        // Neck background
        parts.push(`<rect x="${nutX}" y="${topY - 4}" width="${neckW}" height="${botY - topY + 8}" fill="var(--bg-raised)" rx="3" opacity="0.4"/>`);

        // Position markers (dots on neck at frets 3 and 5)
        for (const mf of [3, 5]) {
            const mx = nutX + (mf - 0.5) * fretSpacing;
            const my = topY + (STRINGS - 1) * stringSpacing / 2;
            parts.push(`<circle cx="${mx}" cy="${my}" r="5" fill="var(--text-muted)" opacity="0.2"/>`);
        }

        // Strings (horizontal)
        for (let s = 0; s < STRINGS; s++) {
            const y  = FB.stringY(s);
            const sw = (0.6 + (STRINGS - 1 - s) * 0.25).toFixed(2); // string 6 (B1) thickest
            parts.push(`<line x1="${nutX}" y1="${y}" x2="${neckEnd}" y2="${y}" stroke="var(--text-secondary)" stroke-width="${sw}" opacity="0.7"/>`);
            // String label
            parts.push(`<text x="${nutX - 8}" y="${y + 4}" text-anchor="end" font-size="11" font-family="var(--font-mono)" fill="var(--text-muted)">${STRING_LABELS[s]}</text>`);
        }

        // Nut
        parts.push(`<line x1="${nutX}" y1="${topY - 6}" x2="${nutX}" y2="${botY + 6}" stroke="var(--text-primary)" stroke-width="3" stroke-linecap="round"/>`);

        // Fret bars
        for (let f = 1; f <= FRETS; f++) {
            const x = nutX + f * fretSpacing;
            parts.push(`<line x1="${x}" y1="${topY - 4}" x2="${x}" y2="${botY + 4}" stroke="var(--line-color)" stroke-width="1.2"/>`);
            // Fret number at bottom
            parts.push(`<text x="${x - fretSpacing / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${f}</text>`);
        }

        // Highlight dots
        for (const h of highlights) {
            const cx   = FB.dotX(h.fret);
            const cy   = FB.stringY(h.string);
            const fill = h.isRoot
                ? 'var(--brand, #7c3aed)'
                : 'var(--chord-blue, #60a5fa)';
            const r    = 10;

            if (h.fret === 0) {
                // Open string: hollow circle
                parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${fill}" stroke-width="2"/>`);
                parts.push(`<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="9" font-weight="700" fill="${fill}">${h.degree}</text>`);
            } else {
                parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="0.92"/>`);
                parts.push(`<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="10" font-weight="700" fill="white">${h.degree}</text>`);
            }
        }

        parts.push(`</svg>`);
        return parts.join('');
    }

    // ── Component ─────────────────────────────────────────────────────────────
    const Fretboard7Component = {

        render: function () {
            const content    = document.getElementById('main-content');
            const keyOptions = KEYS.map(k =>
                `<option value="${esc(k.value)}" ${k.value === (_state.key + (_state.isMinor ? 'm' : '')) ? 'selected' : ''}>${esc(k.label)}</option>`
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
                            <div class="form-group">
                                <label class="form-label">Tom</label>
                                <select id="fb7-key" class="form-input form-select">${keyOptions}</select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Graus</label>
                                <input type="text" id="fb7-degrees" class="form-input"
                                    value="${esc(_state.degreesInput)}"
                                    placeholder="Ex: 1 3 5  ou  1 2 3 5 6" />
                                <span class="form-hint">Números 1–7 separados por espaço</span>
                            </div>
                            <button class="btn btn-primary btn-full" id="btn-fb7-apply">
                                <i class="fa-solid fa-wand-magic-sparkles"></i> Visualizar
                            </button>

                            <!-- Legend -->
                            <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--line-color);">
                                <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px;">Legenda</div>
                                <div style="display:flex;flex-direction:column;gap:8px;">
                                    <div style="display:flex;align-items:center;gap:10px;">
                                        <svg width="22" height="22"><circle cx="11" cy="11" r="10" fill="var(--brand,#7c3aed)"/><text x="11" y="15" text-anchor="middle" font-size="10" font-weight="700" fill="white">1</text></svg>
                                        <span style="font-size:.82rem;color:var(--text-secondary);">Tônica</span>
                                    </div>
                                    <div style="display:flex;align-items:center;gap:10px;">
                                        <svg width="22" height="22"><circle cx="11" cy="11" r="10" fill="var(--chord-blue,#60a5fa)"/><text x="11" y="15" text-anchor="middle" font-size="10" font-weight="700" fill="white">3</text></svg>
                                        <span style="font-size:.82rem;color:var(--text-secondary);">Outros graus</span>
                                    </div>
                                    <div style="display:flex;align-items:center;gap:10px;">
                                        <svg width="22" height="22"><circle cx="11" cy="11" r="10" fill="none" stroke="var(--chord-blue,#60a5fa)" stroke-width="2"/><text x="11" y="15" text-anchor="middle" font-size="9" font-weight="700" fill="var(--chord-blue,#60a5fa)">5</text></svg>
                                        <span style="font-size:.82rem;color:var(--text-secondary);">Corda solta</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Notes list -->
                            <div id="fb7-notes-list"></div>
                        </div>
                    </div>

                </div>
            `;

            if (window.innerWidth <= 768) {
                document.getElementById('fb7-grid').style.gridTemplateColumns = '1fr';
            }

            document.getElementById('btn-fb7-apply').addEventListener('click', () => Fretboard7Component._apply());
            document.getElementById('fb7-key').addEventListener('change', () => Fretboard7Component._apply());
            document.getElementById('fb7-degrees').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') Fretboard7Component._apply();
            });

            Fretboard7Component._apply();
        },

        _apply: function () {
            const keyVal = document.getElementById('fb7-key').value;
            const degStr = (document.getElementById('fb7-degrees').value || '1 3 5').trim();

            _state.isMinor      = keyVal.endsWith('m');
            _state.key          = keyVal.replace(/m$/, '');
            _state.degreesInput = degStr;

            _state.highlights = _resolveHighlights(_state.key, _state.isMinor, degStr);

            const svgEl = document.getElementById('fretboard-svg');
            if (svgEl) svgEl.innerHTML = _buildSVG(_state.highlights);

            // Notes table
            const listEl = document.getElementById('fb7-notes-list');
            if (!listEl) return;

            const rootIdx  = NOTE_NAMES.indexOf(_state.key);
            const intervals = _state.isMinor ? MINOR_INTERVALS : MAJOR_INTERVALS;
            const degrees   = degStr.split(/[\s,]+/).map(d => parseInt(d, 10)).filter(d => d >= 1 && d <= 7);

            if (!degrees.length || rootIdx === -1) { listEl.innerHTML = ''; return; }

            const rows = degrees.map(d => {
                const pc = (rootIdx + intervals[d - 1]) % 12;
                const color = d === 1 ? 'var(--brand,#7c3aed)' : 'var(--chord-blue,#60a5fa)';
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--line-color);">
                    <span style="font-size:.8rem;color:var(--text-muted);">Grau ${d}</span>
                    <span style="font-family:var(--font-mono);font-size:.9rem;font-weight:600;color:${color};">${NOTE_NAMES[pc]}</span>
                </div>`;
            }).join('');

            listEl.innerHTML = `<div style="margin-top:16px;padding-top:4px;">${rows}</div>`;
        },
    };

    window.Fretboard7Component = Fretboard7Component;
    console.info('[HMS] Fretboard7Component loaded.');
})();
