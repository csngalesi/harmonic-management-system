/**
 * HMS — Treino Aleatório  v4
 * Ao selecionar uma playlist, busca assincronamente as músicas dela e
 * atualiza o contador em tempo real (igual a todos os outros filtros).
 */
(function () {
    "use strict";

    const esc = s => String(s || "")
        .replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");

    // Flag → sf-N class (igual ao Repertório)
    const FLAG_LBL = ["Sem flag","Verde","Amarelo","Vermelho","Azul","Roxo","Outro"];

    const _st = {
        setlists:      [],
        allSongs:      [],    // todas as músicas (anotadas com _setlistIds progressivamente)
        memberMap:     {},    // songId → Set<setlistId> — cache de pertinência
        fetchedSlIds:  new Set(), // setlistIds já buscados
        filters: {
            setlistIds: new Set(),
            keys:       new Set(),
            flags:      new Set(),
            harm:       null,
            letra:      null,
            link:       null,
        },
        songs:         [],
        idx:           0,
        active:        false,
        keyHandler:    null,
    };

    // ── Aplica todos os filtros ───────────────────────────────────────────────
    function _applyFilters(songs) {
        const f = _st.filters;
        let r = songs;
        if (f.setlistIds.size > 0)
            r = r.filter(s => {
                const slIds = _st.memberMap[s.id];
                return slIds && [...f.setlistIds].some(id => slIds.has(id));
            });
        if (f.keys.size > 0)
            r = r.filter(s => f.keys.has(s.original_key));
        if (f.flags.size > 0)
            r = r.filter(s => f.flags.has(s.status_flag ?? 0));
        if (f.harm !== null)
            r = r.filter(s => !!(s.harmony_str && s.harmony_str.trim()) === f.harm);
        if (f.letra !== null)
            r = r.filter(s => !!s.has_lyrics === f.letra);
        if (f.link !== null)
            r = r.filter(s => !!s.audio_url === f.link);
        return r;
    }

    function _shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // ── Busca pertinência de uma playlist e atualiza o memberMap ─────────────
    async function _fetchSetlistMembership(slId) {
        if (_st.fetchedSlIds.has(slId)) return;
        _st.fetchedSlIds.add(slId);
        try {
            const songs = await window.HMSAPI.Songs.getAll({ setlistId: slId });
            (songs || []).forEach(s => {
                if (!_st.memberMap[s.id]) _st.memberMap[s.id] = new Set();
                _st.memberMap[s.id].add(slId);
            });
        } catch (e) {
            _st.fetchedSlIds.delete(slId); // permite retry
        }
    }

    // ── Component ─────────────────────────────────────────────────────────────
    const C = {

        render: async function () {
            const content = document.getElementById("main-content");
            content.innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-shuffle"></i></div>
                        <div>
                            <h2>Treino Aleatório</h2>
                            <p>Estude harmonias de forma aleatória com filtros do Repertório</p>
                        </div>
                    </div>
                </div>
                <div id="rt-wrap">
                    <div style="text-align:center;padding:3rem;color:var(--text-muted);">
                        <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem;"></i>
                        <div style="margin-top:.75rem;">Carregando playlists e músicas…</div>
                    </div>
                </div>`;

            try {
                const [setlists, songs] = await Promise.all([
                    window.HMSAPI.Setlists.getAll(),
                    window.HMSAPI.Songs.getAll(),
                ]);
                _st.setlists = setlists || [];
                _st.allSongs = songs || [];

                // ── Offline: pré-popular memberMap do IndexedDB ───────────
                // Sem rede, _fetchSetlistMembership nunca rodou nesta sessão,
                // então o memberMap está vazio e os filtros de setlist não funcionam.
                // Lemos todos os vínculos setlist↔música direto do IndexedDB.
                if (window.HMSOffline && window.HMSOffline.isOffline()) {
                    try {
                        const allLinks = await window.HMSOfflineDB.setlistSongs.getAll();
                        allLinks.forEach(link => {
                            if (!_st.memberMap[link.song_id]) _st.memberMap[link.song_id] = new Set();
                            _st.memberMap[link.song_id].add(link.setlist_id);
                            _st.fetchedSlIds.add(link.setlist_id); // marca como "já buscado"
                        });
                        console.info('[RandomTrain] memberMap pré-populado offline:', _st.fetchedSlIds.size, 'setlists');
                    } catch (e) {
                        console.warn('[RandomTrain] Falha ao pré-popular memberMap offline:', e);
                    }
                }
            } catch (err) {
                _st.setlists = [];
                _st.allSongs = [];
                window.HMSApp.showToast("Erro ao carregar dados.", "error");
            }
            C._renderFilters();
        },

        // ── Painel de filtros ─────────────────────────────────────────────────
        _renderFilters() {
            const wrap = document.getElementById("rt-wrap");
            if (!wrap) return;
            const f = _st.filters;

            const setlistChips = _st.setlists.length
                ? _st.setlists.map(sl => {
                    const on = f.setlistIds.has(sl.id);
                    const loading = on && !_st.fetchedSlIds.has(sl.id);
                    return `<button class="filter-pill rt-setlist${on ? " active" : ""}"
                        data-id="${esc(sl.id)}" style="height:28px;border-radius:99px;">
                        ${loading ? '<i class="fa-solid fa-spinner fa-spin" style="font-size:.65rem;"></i> ' : ""}${esc(sl.name)}</button>`;
                }).join("")
                : `<span style="font-size:.78rem;color:var(--text-muted);">Nenhuma playlist encontrada</span>`;

            const keyChips = window.HarmonyEngine.allKeys().map(k => {
                const on = f.keys.has(k.value);
                return `<button class="filter-pill rt-key${on ? " active" : ""}" data-key="${esc(k.value)}">${esc(k.label)}</button>`;
            }).join("");

            const allFlagOff = f.flags.size === 0;
            const flagChips = `
                <button class="filter-pill rt-flag-all${allFlagOff ? " active" : ""}" data-flag="null" title="Todas">·</button>
                <button class="filter-pill sf-1 rt-flag${f.flags.has(1) ? " active" : ""}" data-flag="1" title="${FLAG_LBL[1]}"><i class="fa-solid fa-flag"></i></button>
                <button class="filter-pill sf-2 rt-flag${f.flags.has(2) ? " active" : ""}" data-flag="2" title="${FLAG_LBL[2]}"><i class="fa-solid fa-flag"></i></button>
                <button class="filter-pill sf-3 rt-flag${f.flags.has(3) ? " active" : ""}" data-flag="3" title="${FLAG_LBL[3]}"><i class="fa-solid fa-flag"></i></button>
                <button class="filter-pill sf-4 rt-flag${f.flags.has(4) ? " active" : ""}" data-flag="4" title="${FLAG_LBL[4]}"><i class="fa-solid fa-flag"></i></button>
                <button class="filter-pill sf-5 rt-flag${f.flags.has(5) ? " active" : ""}" data-flag="5" title="${FLAG_LBL[5]}"><i class="fa-solid fa-flag"></i></button>
                <button class="filter-pill rt-flag${f.flags.has(0) ? " active" : ""}" data-flag="0" title="${FLAG_LBL[0]}"><i class="fa-solid fa-flag" style="opacity:.25;"></i></button>`;

            const tri = (cls, cur, val, label) =>
                `<button class="filter-pill ${cls}${cur === val ? " active" : ""}" data-val="${val}">${label}</button>`;

            // Verificar se alguma playlist selecionada ainda está sendo buscada
            const pendingFetch = [...f.setlistIds].some(id => !_st.fetchedSlIds.has(id));
            const preview  = _applyFilters(_st.allSongs).length;
            const btnDisabled = preview === 0 && !pendingFetch;
            const countHtml = pendingFetch
                ? `<i class="fa-solid fa-spinner fa-spin"></i> Calculando…`
                : `<i class="fa-solid fa-music"></i> <strong style="color:var(--text-primary);">${preview}</strong> música${preview !== 1 ? "s" : ""} selecionada${preview !== 1 ? "s" : ""}`;

            wrap.innerHTML = `
            <div class="panel" style="margin-bottom:.75rem;padding:14px 16px;">
                <div style="margin-bottom:14px;">
                    <div class="filter-group-label">PLAYLISTS <span class="filter-group-hint">vazio = todas</span></div>
                    <div class="filter-row">${setlistChips}</div>
                </div>
                <div style="margin-bottom:14px;">
                    <div class="filter-group-label">TOM <span class="filter-group-hint">vazio = todos</span></div>
                    <div class="filter-row">${keyChips}</div>
                </div>
                <div style="margin-bottom:14px;">
                    <div class="filter-group-label">FLAG <span class="filter-group-hint">vazio = todas</span></div>
                    <div class="filter-row" style="align-items:center;">${flagChips}</div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:16px;align-items:center;">
                    <div style="display:flex;align-items:center;gap:4px;">
                        <span class="filter-label">Harm:</span>
                        ${tri("rt-harm", f.harm, null, "·")}
                        ${tri("rt-harm", f.harm, true,  "S")}
                        ${tri("rt-harm", f.harm, false, "N")}
                    </div>
                    <div style="display:flex;align-items:center;gap:4px;">
                        <span class="filter-label">Letra:</span>
                        ${tri("rt-letra", f.letra, null, "·")}
                        ${tri("rt-letra", f.letra, true,  "S")}
                        ${tri("rt-letra", f.letra, false, "N")}
                    </div>
                    <div style="display:flex;align-items:center;gap:4px;">
                        <span class="filter-label">Link:</span>
                        ${tri("rt-link", f.link, null, "·")}
                        ${tri("rt-link", f.link, true,  "S")}
                        ${tri("rt-link", f.link, false, "N")}
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:12px;
                    padding-top:12px;border-top:1px solid var(--glass-border);">
                    <span style="font-size:.82rem;color:var(--text-muted);">${countHtml}</span>
                    <button id="rt-start" class="btn btn-primary" style="margin-left:auto;"
                        ${btnDisabled ? "disabled" : ""}>
                        <i class="fa-solid fa-play"></i> Iniciar Treino
                    </button>
                </div>
            </div>
            <div class="info-banner" style="font-size:.72rem;">
                Use as teclas ← → para navegar entre músicas durante o treino
            </div>`;

            C._bindFilterEvents();
        },

        // ── Bindings ──────────────────────────────────────────────────────────
        _bindFilterEvents() {
            const wrap = document.getElementById("rt-wrap");
            if (!wrap) return;

            wrap.querySelectorAll(".rt-setlist").forEach(btn =>
                btn.addEventListener("click", async () => {
                    const id = btn.dataset.id;
                    if (_st.filters.setlistIds.has(id)) {
                        _st.filters.setlistIds.delete(id);
                        C._renderFilters();
                    } else {
                        _st.filters.setlistIds.add(id);
                        C._renderFilters(); // mostra spinner
                        await _fetchSetlistMembership(id);
                        C._renderFilters(); // atualiza com contagem real
                    }
                })
            );

            wrap.querySelectorAll(".rt-key").forEach(btn =>
                btn.addEventListener("click", () => {
                    const k = btn.dataset.key;
                    _st.filters.keys.has(k) ? _st.filters.keys.delete(k) : _st.filters.keys.add(k);
                    C._renderFilters();
                })
            );

            wrap.querySelectorAll(".rt-flag-all").forEach(btn =>
                btn.addEventListener("click", () => { _st.filters.flags.clear(); C._renderFilters(); })
            );

            wrap.querySelectorAll(".rt-flag").forEach(btn =>
                btn.addEventListener("click", () => {
                    const n = +btn.dataset.flag;
                    _st.filters.flags.has(n) ? _st.filters.flags.delete(n) : _st.filters.flags.add(n);
                    C._renderFilters();
                })
            );

            wrap.querySelectorAll(".rt-harm").forEach(btn =>
                btn.addEventListener("click", () => {
                    const v = btn.dataset.val;
                    _st.filters.harm = (v === "null" || v === "·") ? null : v === "true";
                    C._renderFilters();
                })
            );

            wrap.querySelectorAll(".rt-letra").forEach(btn =>
                btn.addEventListener("click", () => {
                    const v = btn.dataset.val;
                    _st.filters.letra = (v === "null" || v === "·") ? null : v === "true";
                    C._renderFilters();
                })
            );

            wrap.querySelectorAll(".rt-link").forEach(btn =>
                btn.addEventListener("click", () => {
                    const v = btn.dataset.val;
                    _st.filters.link = (v === "null" || v === "·") ? null : v === "true";
                    C._renderFilters();
                })
            );

            document.getElementById("rt-start")?.addEventListener("click", () => C._start());
        },

        // ── Iniciar treino ────────────────────────────────────────────────────
        _start: async function () {
            const startBtn = document.getElementById("rt-start");
            if (startBtn) { startBtn.disabled = true; startBtn.innerHTML = "<i class=\"fa-solid fa-spinner fa-spin\"></i> Carregando…"; }
            try {
                // Garantir que todas as playlists selecionadas foram buscadas
                await Promise.all([..._st.filters.setlistIds].map(_fetchSetlistMembership));

                const filtered = _applyFilters(_st.allSongs);
                if (filtered.length === 0) {
                    window.HMSApp.showToast("Nenhuma música encontrada com esses filtros.", "warning");
                    return;
                }
                _st.songs  = _shuffle(filtered);
                _st.idx    = 0;
                _st.active = true;
                C._openCurrent();
                C._bindKeyboard();
            } catch (err) {
                console.error("[RandomTrain] start error:", err);
                window.HMSApp.showToast("Erro ao iniciar treino.", "error");
            } finally {
                if (startBtn) { startBtn.disabled = false; startBtn.innerHTML = "<i class=\"fa-solid fa-play\"></i> Iniciar Treino"; }
            }
        },

        // ── Modal idêntico ao Repertório + strip de navegação no topo ────────
        _openCurrent() {
            if (!_st.songs.length) return;
            const song  = _st.songs[_st.idx];
            const total = _st.songs.length;

            window.RepertoireComponent._openShowDetail(song);

            // Injeta strip de navegação no TOPO do sd-modal, acima do header,
            // para não sobrepor o player de áudio e o botão Tocar do footer.
            requestAnimationFrame(() => {
                document.getElementById("rt-nav-bar")?.remove();
                const overlay = document.getElementById("modal-overlay");
                const sdModal = document.querySelector(".sd-modal");
                if (!overlay || !sdModal) return;

                const nav = document.createElement("div");
                nav.id = "rt-nav-bar";
                nav.style.cssText = [
                    "display:flex;align-items:center;justify-content:space-between;",
                    "padding:6px 10px;gap:8px;",
                    "background:var(--bg-raised);",
                    "border-bottom:1px solid var(--glass-border);",
                    "border-radius:var(--radius-md,12px) var(--radius-md,12px) 0 0;",
                    "flex-shrink:0;",
                ].join("");
                nav.innerHTML = `
                    <button id="rt-nav-prev" class="btn btn-ghost"
                        style="padding:4px 12px;font-size:.78rem;height:28px;flex-shrink:0;">
                        <i class="fa-solid fa-arrow-left"></i> Anterior
                    </button>
                    <div style="flex:1;text-align:center;min-width:0;overflow:hidden;">
                        <div style="font-size:.82rem;font-weight:600;color:var(--text-primary);
                            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;">
                            ${song.title || ''}
                        </div>
                        <div style="font-size:.68rem;color:var(--text-muted);font-family:var(--font-mono);">
                            ${song.artist ? song.artist + ' · ' : ''}${_st.idx + 1} / ${total}
                        </div>
                    </div>
                    <button id="rt-nav-next" class="btn btn-primary"
                        style="padding:4px 12px;font-size:.78rem;height:28px;flex-shrink:0;">
                        Próximo <i class="fa-solid fa-arrow-right"></i>
                    </button>`;

                // Insere antes de tudo dentro do sd-modal
                sdModal.insertBefore(nav, sdModal.firstChild);

                document.getElementById("rt-nav-prev")?.addEventListener("click", e => {
                    e.stopPropagation(); C._navigate(-1);
                });
                document.getElementById("rt-nav-next")?.addEventListener("click", e => {
                    e.stopPropagation(); C._navigate(+1);
                });

                const obs = new MutationObserver(() => {
                    if (overlay.classList.contains("hidden")) {
                        _st.active = false;
                        obs.disconnect();
                    }
                });
                obs.observe(overlay, { attributes: true, attributeFilter: ["class"] });
            });
        },

        _navigate(delta) {
            if (!_st.songs.length) return;
            if (window.HMSAudio && window.HMSAudio.isPlaying) window.HMSAudio.stop();
            window.HMSApp.closeModal();
            document.getElementById("rt-nav-bar")?.remove();
            _st.idx = ((_st.idx + delta) % _st.songs.length + _st.songs.length) % _st.songs.length;
            setTimeout(() => { _st.active = true; C._openCurrent(); }, 80);
        },

        _bindKeyboard() {
            if (_st.keyHandler) document.removeEventListener("keydown", _st.keyHandler);
            _st.keyHandler = e => {
                if (!_st.active) return;
                if (e.key === "ArrowRight") { e.preventDefault(); C._navigate(+1); }
                else if (e.key === "ArrowLeft") { e.preventDefault(); C._navigate(-1); }
            };
            document.addEventListener("keydown", _st.keyHandler);
        },
    };

    window.RandomTrainComponent = C;
    console.info("[HMS] RandomTrainComponent v4 loaded.");
})();
