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
                            <p>${esc([s.artist, s.genre].filter(Boolean).join(' · '))}</p>
                        </div>
                    </div>
                        <div style="display:flex;align-items:center;background:var(--surface);border:1px solid var(--line-color);border-radius:8px;padding:2px;margin-right:8px;">
                            <button class="btn btn-primary" id="btn-play-audio" style="border-radius:6px;height:100%;margin-right:6px;" title="Tocar sequência">
                                <i class="fa-solid fa-play"></i> Ouvir Tática
                            </button>
                            <div style="display:flex;align-items:center;padding-right:10px;">
                                <label for="play-bpm" style="font-size:0.8rem;color:var(--text-muted);margin-right:6px;margin-bottom:0;">BPM:</label>
                                <input type="number" id="play-bpm" value="45" min="20" max="240" step="5" style="width:55px;background:transparent;border:none;color:white;font-family:var(--font-mono);font-size:0.9rem;outline:none;" />
                            </div>
                        </div>
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

                <div class="panel" id="lyrics-panel">
                    <div class="panel-header">
                        <span class="panel-title"><i class="fa-solid fa-align-left"></i> Letra</span>
                        <button class="btn btn-secondary btn-sm" id="btn-fetch-lyrics-player">
                            <i class="fa-solid fa-magnifying-glass"></i> ${s.lyrics ? 'Atualizar' : 'Buscar Letra'}
                        </button>
                    </div>
                    <div class="panel-body" id="lyrics-body">
                        ${s.lyrics
                            ? `<pre style="white-space:pre-wrap;font-family:var(--font-ui);font-size:.9rem;color:var(--text-secondary);line-height:1.7;">${esc(s.lyrics)}</pre>`
                            : `<p style="color:var(--text-muted);font-size:.875rem;">Nenhuma letra cadastrada. Clique em "Buscar Letra" para pesquisar automaticamente.</p>`
                        }
                    </div>
                </div>
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
                    const bpmInput = document.getElementById('play-bpm');
                    const bpm = bpmInput ? parseInt(bpmInput.value, 10) || 60 : 60;

                    const tokens = window.HarmonyEngine.translate(
                        _state.song.harmony_str,
                        _state.displayKey,
                        _state.displayMinor,
                    );

                    try {
                        await window.HMSAudio.playSequence(tokens, bpm, () => {
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
                    }
                });
            });

            document.getElementById('btn-fetch-lyrics-player').addEventListener('click', () => {
                PlayerComponent._fetchAndSaveLyrics();
            });
        },

        _fetchAndSaveLyrics: async function () {
            const s   = _state.song;
            const btn = document.getElementById('btn-fetch-lyrics-player');
            const body = document.getElementById('lyrics-body');
            if (!btn || !body || !s) return;

            const origLabel = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="btn-spinner"></span> Buscando…';

            const lrclibFetch = async (artistName) => {
                const res = await fetch(
                    `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artistName)}&track_name=${encodeURIComponent(s.title)}`,
                    { signal: AbortSignal.timeout(9000) }
                );
                if (!res.ok) return null;
                const data = await res.json();
                return data.plainLyrics || data.syncedLyrics || null;
            };

            let lyrics = null;
            try {
                lyrics = await lrclibFetch(s.artist || '');
                if (!lyrics && s.artist && !s.artist.startsWith('Grupo ')) {
                    lyrics = await lrclibFetch('Grupo ' + s.artist);
                }
            } catch { /* network error */ }

            if (!lyrics) {
                window.HMSApp.showToast('Letra não encontrada no lrclib.net.', 'warning');
                btn.disabled = false;
                btn.innerHTML = origLabel;
                return;
            }

            try {
                await window.HMSAPI.Songs.update(s.id, { lyrics: lyrics.trim() });
                _state.song.lyrics = lyrics.trim();
                body.innerHTML = `<pre style="white-space:pre-wrap;font-family:var(--font-ui);font-size:.9rem;color:var(--text-secondary);line-height:1.7;">${esc(lyrics.trim())}</pre>`;
                btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Atualizar';
                window.HMSApp.showToast('Letra salva!', 'success');
            } catch (err) {
                window.HMSApp.showToast('Erro ao salvar letra: ' + err.message, 'error');
                btn.innerHTML = origLabel;
            }
            btn.disabled = false;
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
                if (t.type === 'LABEL') {
                    // Plain text annotation — rendered outside the chord box
                    return `<span class="harmony-text">${esc(t.value)}</span>`;
                }
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
