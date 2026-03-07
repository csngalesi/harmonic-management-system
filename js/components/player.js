/**
 * HMS — Player / Transpositor Component (Módulo 1)
 * Reads a song's harmony_str in degrees and renders it transposed to any key.
 * Exposed via window.PlayerComponent
 */
(function () {
    'use strict';

    let _state = {
        song: null,
        displayKey: null,
        displayMinor: false,
        fontSize: 'md', // 'md' | 'lg' | 'xl'
    };

    const KEYS = window.HarmonyEngine.allKeys();
    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const PlayerComponent = {

        render: async function (songId) {
            const content = document.getElementById('main-content');

            if (!songId) {
                content.innerHTML = `
                    <div class="empty-state" style="margin-top:60px;">
                        <div class="empty-icon"><i class="fa-solid fa-play-circle"></i></div>
                        <h3>Nenhuma música selecionada</h3>
                        <p>Abra uma música no Repertório para exibi-la aqui.</p>
                        <button class="btn btn-primary" style="margin-top:16px;" id="btn-go-repertoire">
                            <i class="fa-solid fa-list-music"></i> Ir para o Repertório
                        </button>
                    </div>`;
                document.getElementById('btn-go-repertoire').addEventListener('click', () => {
                    window.HMSApp.navigate('repertoire');
                });
                return;
            }

            content.innerHTML = `<div class="content-loader"><div class="loader-spinner"></div><p>Carregando…</p></div>`;

            try {
                _state.song = await window.HMSAPI.Songs.getById(songId);
            } catch (err) {
                content.innerHTML = `<div class="empty-state"><h3>Erro ao carregar música.</h3><p>${esc(err.message)}</p></div>`;
                return;
            }

            // Default display key = original key
            const origKey = _state.song.original_key || 'C';
            const origIsMinor = origKey.endsWith('m');
            const origRoot = origKey.replace(/m$/, '');
            _state.displayKey = origRoot;
            _state.displayMinor = origIsMinor;

            PlayerComponent._renderPage();
        },

        _renderPage: function () {
            const s = _state.song;
            const content = document.getElementById('main-content');

            const keyOptions = KEYS.map(k =>
                `<option value="${k.value}" ${k.value === (_state.displayKey + (_state.displayMinor ? 'm' : '')) ? 'selected' : ''}>${k.label}</option>`
            ).join('');

            content.innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-play-circle"></i></div>
                        <div>
                            <h2>${esc(s.title)}</h2>
                            <p>${esc([s.artist, s.composer, s.genre].filter(Boolean).join(' · '))}</p>
                        </div>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-primary" id="btn-play-audio" style="margin-right:8px;" title="Tocar sequência (1 acorde/seg)">
                            <i class="fa-solid fa-play"></i> Ouvir Tática
                        </button>
                        <button class="btn btn-secondary" id="btn-back-rep">
                            <i class="fa-solid fa-arrow-left"></i> Repertório
                        </button>
                        <button class="btn btn-secondary" id="btn-edit-song">
                            <i class="fa-solid fa-pen-to-square"></i> Editar
                        </button>
                    </div>
                </div>

                <!-- Key selector + size -->
                <div class="panel mb-3">
                    <div class="panel-header">
                        <span class="panel-title"><i class="fa-solid fa-sliders"></i> Transposição</span>
                    </div>
                    <div class="panel-body">
                        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <span class="form-label" style="margin:0;">Tom Original:</span>
                                <span class="song-key-badge">${esc(s.original_key)}</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:8px;">
                                <label class="form-label" style="margin:0;" for="key-select">Tom Exibido:</label>
                                <select id="key-select" class="form-input form-select" style="width:160px;">
                                    ${keyOptions}
                                </select>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
                                <button class="btn btn-secondary btn-sm font-size-btn ${_state.fontSize === 'md' ? 'active' : ''}" data-size="md">A</button>
                                <button class="btn btn-secondary btn-sm font-size-btn ${_state.fontSize === 'lg' ? 'active' : ''}" data-size="lg" style="font-size:1.1rem;">A</button>
                                <button class="btn btn-secondary btn-sm font-size-btn ${_state.fontSize === 'xl' ? 'active' : ''}" data-size="xl" style="font-size:1.3rem;">A</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Chord grid -->
                <div class="panel mb-3">
                    <div class="panel-header">
                        <span class="panel-title"><i class="fa-solid fa-music"></i> Acordes</span>
                        <span class="form-hint" style="margin:0;" id="harmony-raw-hint"></span>
                    </div>
                    <div class="panel-body">
                        <div id="chord-grid" class="chord-grid size-${_state.fontSize}">
                            <!-- rendered by _renderChords() -->
                        </div>
                    </div>
                </div>

                <!-- Harmony string (raw) -->
                <div class="panel mb-3">
                    <div class="panel-header">
                        <span class="panel-title"><i class="fa-solid fa-code"></i> String de Graus (original)</span>
                    </div>
                    <div class="panel-body">
                        <div class="harmony-preview">${esc(s.harmony_str)}</div>
                    </div>
                </div>

                ${s.lyrics ? `
                <div class="panel">
                    <div class="panel-header">
                        <span class="panel-title"><i class="fa-solid fa-align-left"></i> Letra</span>
                    </div>
                    <div class="panel-body">
                        <pre style="white-space:pre-wrap;font-family:var(--font-ui);font-size:.9rem;color:var(--text-secondary);line-height:1.7;">${esc(s.lyrics)}</pre>
                    </div>
                </div>` : ''}
            `;

            // Render chords for default display key
            PlayerComponent._renderChords();

            // Event listeners
            const playBtn = document.getElementById('btn-play-audio');
            playBtn.addEventListener('click', async () => {
                if (window.HMSAudio.isPlaying) {
                    window.HMSAudio.stop();
                    playBtn.innerHTML = '<i class="fa-solid fa-play"></i> Ouvir Tática';
                    playBtn.classList.remove('btn-danger');
                    playBtn.classList.add('btn-primary');
                } else {
                    const tokens = window.HarmonyEngine.translate(
                        _state.song.harmony_str,
                        _state.displayKey,
                        _state.displayMinor,
                    );

                    try {
                        await window.HMSAudio.playSequence(tokens, () => {
                            // Reset button when finished naturally
                            if (playBtn) {
                                playBtn.innerHTML = '<i class="fa-solid fa-play"></i> Ouvir Tática';
                                playBtn.classList.remove('btn-danger');
                                playBtn.classList.add('btn-primary');
                            }
                        });

                        playBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Parar';
                        playBtn.classList.remove('btn-primary');
                        playBtn.classList.add('btn-danger');
                    } catch (err) {
                        console.error('Audio start failure', err);
                        alert('Erro ao iniciar o motor de áudio. Tente interagir com a tela primeiro.');
                    }
                }
            });

            document.getElementById('btn-back-rep').addEventListener('click', () => {
                if (window.HMSAudio && window.HMSAudio.isPlaying) window.HMSAudio.stop();
                window.HMSApp.navigate('repertoire');
            });
            document.getElementById('btn-edit-song').addEventListener('click', () => {
                if (window.HMSAudio && window.HMSAudio.isPlaying) window.HMSAudio.stop();
                window.RepertoireComponent.openSongModal(_state.song.id);
            });

            document.getElementById('key-select').addEventListener('change', function () {
                const kObj = KEYS.find(k => k.value === this.value);
                if (kObj) {
                    _state.displayKey = kObj.value.replace(/m$/, '');
                    _state.displayMinor = kObj.isMinor;
                    PlayerComponent._renderChords();
                }
            });

            document.querySelectorAll('.font-size-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    _state.fontSize = btn.dataset.size;
                    document.querySelectorAll('.font-size-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const grid = document.getElementById('chord-grid');
                    if (grid) {
                        grid.className = `chord-grid size-${_state.fontSize}`;
                        // Re-render to update size class without full reload
                    }
                });
            });
        },

        _renderChords: function () {
            const grid = document.getElementById('chord-grid');
            if (!grid || !_state.song) return;

            const tokens = window.HarmonyEngine.translate(
                _state.song.harmony_str,
                _state.displayKey,
                _state.displayMinor,
            );

            if (tokens.length === 0) {
                grid.innerHTML = '<p class="text-muted" style="padding:12px;">Nenhum acorde para exibir.</p>';
                return;
            }

            grid.innerHTML = tokens.map(t => {
                if (t.type === 'STRUCT') {
                    return `<div class="chord-cell struct">${esc(t.value)}</div>`;
                }
                return `<div class="chord-cell">${esc(t.value)}</div>`;
            }).join('');
        },
    };

    window.PlayerComponent = PlayerComponent;
    console.info('[HMS] PlayerComponent loaded.');
})();
