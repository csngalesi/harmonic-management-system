/**
 * HMS — MelodyEngine
 * Traduz e parseia melodias funcionais (grau + oitava + duração).
 *
 * Formato de dados (MelodicNote):
 *   { deg: '1'|'b3'|'#4'|..., oct: 0|-1|+1, dur: '8n'|'4n'|... }
 *
 * Graus cromáticos (independentes da escala — acidente explícito):
 *   '1' '2' 'b3' '3' '4' '#4' '5' 'b6' '6' 'b7' '7'
 *   (b = bemol, # = sustenido)
 *
 * Oitava base = 2  (oct=0 → C2 = MIDI 36 em Tone.js)
 *   oct=-1 → C1 (sub-baixo)   oct=+1 → C3 (médio)
 *
 * Formato de texto (parseMelody):
 *   "1:4n 2:4n b3(-1):8n 5:2n"
 *   (oitava opcional, padrão 0; duração opcional, padrão '8n')
 *
 * Exposed via window.MelodyEngine
 */
(function () {
    'use strict';

    // ── Grau → semitons acima da raiz ────────────────────────────────────────
    const DEG_ST = {
        '1' : 0,  'b2': 1,  '#1': 1,
        '2' : 2,  'b3': 3,  '#2': 3,
        '3' : 4,  'b4': 4,
        '4' : 5,  '#4': 6,  'b5': 6,
        '5' : 7,  '#5': 8,  'b6': 8,
        '6' : 9,  'b7':10,  '#6':10,
        '7' :11,  'b1':11,
    };

    // Em Tone.js: C2 = MIDI 36, C3 = 48, C4 = 60 (middle C)
    const C2_MIDI = 36;

    function _degSt(deg) {
        const st = DEG_ST[deg];
        if (st === undefined) console.warn('[MelodyEngine] Grau desconhecido:', deg);
        return st ?? 0;
    }

    // ── durToSeconds — converte notação Tone.js → segundos ──────────────────
    function _durToSec(dur, bpm) {
        const b = 60 / bpm;
        const map = {
            '1n' : b * 4,   '2n' : b * 2,   '4n' : b,     '8n' : b / 2,
            '16n': b / 4,   '32n': b / 8,
            '1t' : b * 8/3, '2t' : b * 4/3, '4t' : b*2/3, '8t' : b / 3,
            '2n.': b * 3,   '4n.': b * 1.5, '8n.': b*.75,
        };
        return map[dur] ?? b / 2; // padrão: 8n
    }

    // ── API pública ───────────────────────────────────────────────────────────
    const MelodyEngine = {

        /**
         * Traduz um array funcional para notas absolutas Tone.js.
         *
         * @param {Array}   melody   [{deg, oct, dur}, ...]
         * @param {string}  rootName Nome da nota raiz: 'C', 'F#', 'Bb'…
         * @param {boolean} _isMinor (reservado — graus já são cromáticos)
         * @returns {Array} [{note:'F#2', dur:'8n'}, ...]
         */
        translate(melody, rootName, _isMinor = false) {
            const rootIdx  = window.HarmonyEngine._noteToIdx(rootName) ?? 0;
            const baseMidi = C2_MIDI + rootIdx;
            return melody.map(n => ({
                note: Tone.Frequency(baseMidi + _degSt(n.deg) + (n.oct ?? 0) * 12, 'midi').toNote(),
                dur : n.dur || '8n',
            }));
        },

        /**
         * Converte string de texto em array funcional.
         *
         * Formato: "deg(oct):dur" — oct e dur são opcionais.
         * Exemplos:
         *   "1:4n 2:4n b3:4n 4:4n"
         *   "5(-1):8n 6(-1):8n 7(-1):8n 1:4n"
         *   "b3:8n 2:8n b2:8n 1:4n"
         *
         * @param {string} str
         * @returns {Array} [{deg, oct, dur}, ...]
         */
        parse(str) {
            if (!str || !str.trim()) return [];
            return str.trim().split(/\s+/).map(tok => {
                const m = tok.match(/^([b#]?[1-7])(?:\(([+-]?\d+)\))?(?::(\S+))?$/);
                if (!m) return null;
                return {
                    deg: m[1],
                    oct: m[2] !== undefined ? parseInt(m[2], 10) : 0,
                    dur: m[3] || '8n',
                };
            }).filter(Boolean);
        },

        /**
         * Converte duração Tone.js → segundos para um dado BPM.
         * Reutilizado pelo AudioEngine.playMelody.
         */
        durToSeconds: _durToSec,

        /**
         * Retorna os nomes de nota absolutos para um dado tom (uso na UI).
         * @param {Array}  melody   resultado de parse()
         * @param {string} rootName
         * @returns {string[]} ex: ['C2','D2','Eb2','F2']
         */
        noteNames(melody, rootName) {
            return this.translate(melody, rootName).map(n => n.note);
        },
    };

    window.MelodyEngine = MelodyEngine;
    console.info('[HMS] MelodyEngine loaded.');
})();
