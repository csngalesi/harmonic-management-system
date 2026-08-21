/**
 * HMS — SPA App Controller
 * Session management, routing, sidebar, modals, and global UI helpers.
 */
(function () {
    'use strict';

    // ── Offline State ────────────────────────────────────────────
    window.HMSOffline = {
        _forceOffline: false,

        isOffline() { return this._forceOffline || !navigator.onLine; },

        setForce(val) {
            this._forceOffline = val;
            this._update();
            // Re-render current view if repertoire is active
            if (window.RepertoireComponent && document.getElementById('song-list')) {
                RepertoireComponent._renderSongList();
            }
        },

        init() {
            window.addEventListener('online',  () => HMSOffline._update());
            window.addEventListener('offline', () => HMSOffline._update());
            HMSOffline._update();
        },

        _update() {
            const offline = this.isOffline();
            // Badge
            const badge = document.getElementById('offline-badge');
            if (badge) {
                badge.classList.toggle('hidden', !offline);
                badge.title = this._forceOffline ? 'Modo offline simulado (teste)' : 'Sem conexão';
                badge.innerHTML = `<i class="fa-solid fa-wifi-slash" style="font-size:.65rem;"></i>
                    ${this._forceOffline ? 'OFFLINE (teste)' : 'OFFLINE'}`;
            }
            // Logout button
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.disabled = offline;
                logoutBtn.title = offline ? 'Sem conexão — faça login novamente quando online' : 'Sair';
                logoutBtn.style.opacity = offline ? '0.3' : '';
            }
            if (offline) {
                console.info('[HMS] Offline mode active — reading from IndexedDB', this._forceOffline ? '(FORCED)' : '');
            }
        },
    };

    // ── Read-Only Mode (online, but editing disabled) ─────────────
    // Completely separate from HMSOffline: data is still fetched from
    // Supabase; only the write/edit buttons are disabled.
    window.HMSReadOnly = {
        isActive() {
            return localStorage.getItem('hms_readonly_mode') === '1';
        },

        set(val) {
            localStorage.setItem('hms_readonly_mode', val ? '1' : '0');
            this._updateBadge();
            // Re-render the song list so chip buttons (H, edit) reflect the new state
            if (window.RepertoireComponent && document.getElementById('song-list')) {
                RepertoireComponent._renderSongList();
            }
        },

        _updateBadge() {
            const badge = document.getElementById('readonly-badge');
            if (badge) badge.classList.toggle('hidden', !this.isActive());
        },

        init() {
            this._updateBadge();
        },
    };

    // ── Global UI Helpers ────────────────────────────────────────
    window.HMSApp = {

        showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            if (!container) return;
            const icons = {
                success: 'fa-circle-check',
                error: 'fa-circle-xmark',
                warning: 'fa-triangle-exclamation',
                info: 'fa-circle-info',
            };
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.innerHTML = `
                <span class="toast-icon"><i class="fa-solid ${icons[type] || icons.info}"></i></span>
                <span class="toast-message">${message}</span>
            `;
            container.appendChild(toast);
            setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3700);
        },

        showLoading() {
            const el = document.getElementById('global-loader');
            if (el) el.classList.remove('hidden');
        },

        hideLoading() {
            const el = document.getElementById('global-loader');
            if (el) el.classList.add('hidden');
        },

        openModal(htmlContent) {
            const overlay = document.getElementById('modal-overlay');
            const container = document.getElementById('modal-container');
            if (!overlay || !container) return;
            container.innerHTML = htmlContent;
            overlay.classList.remove('hidden');
            overlay.addEventListener('click', HMSApp._overlayClick);
        },

        closeModal() {
            const overlay = document.getElementById('modal-overlay');
            if (!overlay) return;
            // Para o áudio ao fechar qualquer modal (song detail, preferences, etc.)
            if (window.HMSAudio && window.HMSAudio.isPlaying) window.HMSAudio.stop();
            overlay.classList.add('hidden');
            overlay.removeEventListener('click', HMSApp._overlayClick);
            const container = document.getElementById('modal-container');
            if (container) container.innerHTML = '';
        },

        _overlayClick(e) {
            if (e.target === document.getElementById('modal-overlay')) {
                window.HMSApp.closeModal();
            }
        },

        // Navigate to a route (optionally with a payload, e.g. songId)
        navigate(route, payload) {
            App.navigate(route, payload);
        },
    };

    // ── Routes ───────────────────────────────────────────────────
    const ROUTES = {
        repertoire: window.RepertoireComponent,
        player: window.PlayerComponent,
        analyzer: window.AnalyzerComponent,
        extractor: window.ExtractorComponent,
        studies7:       window.Studies7Component,
        fretboard7:     window.Fretboard7Component,
        melodicStudies: window.MelodicStudiesComponent,
        harmonicMelodic: window.HarmonicMelodicComponent,
        harmonicBass:    window.HarmonicBassComponent,
        guitarSampler:   window.GuitarSamplerComponent,
    };

    // ── App Controller ───────────────────────────────────────────
    const App = {
        _currentRoute: null,
        _backHistory: [],

        init: async function () {
            window.HMSApp.showLoading();
            window.HMSOffline.init();
            window.HMSReadOnly.init();
            try {
                // Timeout de 4s: evita que o app fique pendurado em modo avião
                // enquanto o Supabase tenta renovar o token
                const sessionPromise = window.HMSAuth.getSession();
                const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 4000));
                const session = await Promise.race([sessionPromise, timeoutPromise]);

                if (session) {
                    App._enteredViaCache = false;
                    localStorage.setItem('hms-cached-user', JSON.stringify({
                        id:    session.user.id,
                        email: session.user.email,
                        user_metadata: session.user.user_metadata || {},
                    }));
                    App._showApp(session.user);
                } else {
                    // Sem sessão (expirada, offline ou timeout) — usa cache se disponível
                    const cached = App._getCachedUser();
                    if (cached) {
                        console.info('[HMS] Sessão indisponível — abrindo via cache:', cached.email);
                        App._enteredViaCache = true;
                        App._showApp(cached);
                    } else {
                        App._showLogin();
                    }
                }
            } catch (err) {
                console.error('[HMS] Session check failed:', err);
                const cached = App._getCachedUser();
                if (cached) {
                    console.info('[HMS] Erro de sessão — abrindo via cache:', cached.email);
                    App._enteredViaCache = true;
                    App._showApp(cached);
                } else {
                    App._showLogin();
                }
            } finally {
                window.HMSApp.hideLoading();
            }

            window.HMSAuth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_IN' && session) {
                    // Login real — sai do modo cache
                    App._enteredViaCache = false;
                    localStorage.setItem('hms-cached-user', JSON.stringify({
                        id:    session.user.id,
                        email: session.user.email,
                        user_metadata: session.user.user_metadata || {},
                    }));
                    App._showApp(session.user);
                } else if (event === 'SIGNED_OUT') {
                    // Se entramos via cache, SIGNED_OUT é falso alarme do SDK
                    // (token refresh falhou em modo avião). Ignoramos.
                    if (App._enteredViaCache) {
                        console.info('[HMS] SIGNED_OUT ignorado — app em modo cache offline');
                        return;
                    }
                    // Logout real (usuário clicou em Sair)
                    localStorage.removeItem('hms-cached-user');
                    App._showLogin();
                }
            });
        },

        _getCachedUser() {
            try {
                const raw = localStorage.getItem('hms-cached-user');
                return raw ? JSON.parse(raw) : null;
            } catch { return null; }
        },

        // ── Screens ──────────────────────────────────────────────
        _showLogin: function () {
            document.getElementById('app-screen').classList.add('hidden');
            const ls = document.getElementById('login-screen');
            ls.classList.remove('hidden');
            App._currentRoute = null;
            App._sidebarReady = false;

            const form = document.getElementById('login-form');
            const loginBtn = document.getElementById('login-btn');
            const signupBtn = document.getElementById('signup-btn');
            const errorEl = document.getElementById('login-error');
            let isSignup = false;

            form.onsubmit = async (e) => {
                e.preventDefault();
                const email = document.getElementById('login-email').value.trim();
                const password = document.getElementById('login-password').value;
                errorEl.classList.add('hidden');

                loginBtn.disabled = true;
                loginBtn.innerHTML = '<span class="btn-spinner"></span> Aguarde…';

                try {
                    if (isSignup) {
                        await window.HMSAuth.signup(email, password);
                        window.HMSApp.showToast('Conta criada! Verifique seu e-mail.', 'success');
                    } else {
                        await window.HMSAuth.login(email, password);
                    }
                } catch (err) {
                    errorEl.textContent = err.message || 'Erro ao autenticar.';
                    errorEl.classList.remove('hidden');
                    loginBtn.disabled = false;
                    loginBtn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> ${isSignup ? 'Criar Conta' : 'Entrar'}`;
                }
            };

            signupBtn.onclick = () => {
                isSignup = !isSignup;
                loginBtn.innerHTML = isSignup
                    ? '<i class="fa-solid fa-user-plus"></i> Criar Conta'
                    : '<i class="fa-solid fa-right-to-bracket"></i> Entrar';
                signupBtn.textContent = isSignup ? 'Já tenho conta' : 'Criar conta';
            };
        },

        _showApp: function (user) {
            document.getElementById('login-screen').classList.add('hidden');
            const appScreen = document.getElementById('app-screen');
            appScreen.classList.remove('hidden');

            const emailEl = document.getElementById('user-email');
            if (emailEl && user) emailEl.textContent = user.email || 'Músico';

            if (!App._sidebarReady) {
                App._setupSidebar();
                App._sidebarReady = true;
            }
            if (!App._currentRoute) {
                const hash = location.hash.slice(1);
                const initial = ROUTES[hash] ? hash : 'repertoire';
                // replaceState sets entry #1; pushState adds entry #2.
                // With 2 entries, the first Android back press fires popstate
                // (goes to #1) instead of exiting the app. The popstate handler
                // then re-pushes, keeping ≥1 entry at all times.
                history.replaceState({ route: initial }, '', '#' + initial);
                history.pushState({ route: initial }, '', '#' + initial);
                App.navigate(initial, undefined, true);
            }
        },

        // ── Sidebar ──────────────────────────────────────────────
        _setupSidebar: function () {
            const sidebar = document.getElementById('sidebar');
            const backdrop = document.getElementById('sidebar-backdrop');

            const toggleBtn = document.getElementById('sidebar-toggle');
            if (toggleBtn && sidebar) {
                toggleBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
            }

            // -- Quick-filter buttons (N / M / m) visíveis no sidebar colapsado ---
            const SQF_MAJOR = ['A','B','C','D','E','F','G','Bb','Db','Eb','F#','Ab','Gb','Cb'];
            const SQF_MINOR = ['Am','Bm','Cm','Dm','Em','Fm','Gm','Bbm','C#m','D#m','F#m','G#m','Abm','Ebm'];

            function _sqfApply(btn, active, activeColor, activeBg, inactiveColor) {
                if (!btn) return;
                btn.classList.toggle('active', active);
                if (active) {
                    btn.style.setProperty('background',  activeBg,    'important');
                    btn.style.setProperty('border-color',activeColor,  'important');
                    btn.style.setProperty('color',       activeColor,  'important');
                    btn.style.setProperty('box-shadow',  `0 0 0 1px ${activeColor}`, 'important');
                } else {
                    btn.style.removeProperty('background');
                    btn.style.removeProperty('border-color');
                    btn.style.removeProperty('box-shadow');
                    // Define cor inativa explicitamente para não depender da cascata
                    btn.style.setProperty('color', inactiveColor, 'important');
                }
            }

            function _sqfSync() {
                const RC = window.RepertoireComponent;
                if (!RC || !RC.quickFilterState) return;
                try {
                    const st = RC.quickFilterState(SQF_MAJOR, SQF_MINOR);
                    _sqfApply(document.getElementById('sqf-n'), st.n, '#ca8a04',     'rgba(202,138,4,.22)', '#ca8a04');
                    _sqfApply(document.getElementById('sqf-M'), st.M, 'var(--brand)','var(--brand-dim)',    '#94a3b8');
                    _sqfApply(document.getElementById('sqf-m'), st.m, 'var(--brand)','var(--brand-dim)',    '#94a3b8');
                } catch(e) { /* silencioso */ }
            }

            // Event delegation — captura cliques independentemente do timing de init
            document.addEventListener('click', (e) => {
                const btn = e.target.closest('.sqf-btn');
                if (!btn) return;
                const RC = window.RepertoireComponent;
                if (!RC || !RC.quickFilter) return;
                try {
                    RC.quickFilter(btn.dataset.sqf, SQF_MAJOR, SQF_MINOR);
                    _sqfSync();
                } catch(err) {
                    console.error('[SQF]', err);
                }
            });

            // Sincroniza visual dos botões periodicamente (só quando sidebar colapsado)
            setInterval(() => {
                if (sidebar && sidebar.classList.contains('collapsed')) _sqfSync();
            }, 800);

            const mobileBtn = document.getElementById('mobile-menu-btn');
            if (mobileBtn) {
                mobileBtn.addEventListener('click', () => App._openMobileSidebar());
            }

            if (backdrop) {
                backdrop.addEventListener('click', () => App._closeMobileSidebar());
            }

            document.querySelectorAll('.nav-link[data-route]').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (App._isMobile()) App._closeMobileSidebar();
                    App.navigate(link.dataset.route);
                });
            });

            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', App._handleLogout);
            }

            // Clique no avatar do usuário abre preferências
            const userInfoEl = document.querySelector('.user-info');
            if (userInfoEl) {
                userInfoEl.style.cursor = 'pointer';
                userInfoEl.addEventListener('click', App._openUserPrefs);
            }

            window.addEventListener('resize', () => {
                if (!App._isMobile()) App._closeMobileSidebar();
            });

            // Back button: close sidebar first; otherwise navigate to previous route.
            // Always re-push a state so Android never exits the app (history trap).
            window.addEventListener('popstate', () => {
                if (App._isMobile() && document.getElementById('sidebar')?.classList.contains('mobile-open')) {
                    App._closeMobileSidebar();
                    history.pushState({ route: App._currentRoute }, '', '#' + App._currentRoute);
                    return;
                }
                const prevRoute = App._backHistory.pop();
                if (prevRoute && ROUTES[prevRoute]) {
                    App.navigate(prevRoute, undefined, true);
                }
                // Always keep a history entry so Android back never exits
                history.pushState({ route: App._currentRoute }, '', '#' + App._currentRoute);
            });
        },

        _isMobile: () => window.innerWidth <= 768,
        _openMobileSidebar: () => {
            document.getElementById('sidebar')?.classList.add('mobile-open');
            document.getElementById('sidebar-backdrop')?.classList.remove('hidden');
        },
        _closeMobileSidebar: () => {
            document.getElementById('sidebar')?.classList.remove('mobile-open');
            document.getElementById('sidebar-backdrop')?.classList.add('hidden');
        },

        // ── Navigation ───────────────────────────────────────────────
        navigate: function (route, payload, _skipPush) {
            if (!ROUTES[route]) {
                console.warn('[HMS] Unknown route:', route);
                return;
            }

            if (!_skipPush) {
                if (App._currentRoute) App._backHistory.push(App._currentRoute);
                history.pushState({ route }, '', '#' + route);
            }

            App._currentRoute = route;

            document.querySelectorAll('.nav-link[data-route]').forEach(link => {
                link.classList.toggle('active', link.dataset.route === route);
            });

            ROUTES[route].render(payload);
        },

        // ── Preferências do Usuário ────────────────────────────────────
        _openUserPrefs: function () {
            const email    = document.getElementById('user-email')?.textContent || '';
            const current  = localStorage.getItem('hms_show_pref') || 'acor';
            const readOnly = window.HMSReadOnly.isActive();

            const opts = [
                { key: 'func',         icon: 'fa-music',  label: 'Harm Func',   desc: 'Funções harmônicas' },
                { key: 'acor',         icon: 'fa-guitar', label: 'Harm Acor',   desc: 'Acordes no tom'     },
                { key: 'letra-clara',  icon: 'fa-sun',    label: 'Letra Clara', desc: 'Fundo claro'        },
                { key: 'letra-escura', icon: 'fa-moon',   label: 'Letra Escura',desc: 'Fundo escuro'       },
            ];

            const optsHtml = opts.map(o => {
                const active = o.key === current;
                return `
                <button class="pref-opt" data-pref="${o.key}" style="
                    display:flex;flex-direction:column;align-items:center;gap:6px;
                    padding:16px 8px;border-radius:14px;cursor:pointer;transition:all .2s;
                    font-family:var(--font-ui);
                    border:2px solid ${active ? 'var(--brand)' : 'var(--glass-border)'};
                    background:${active ? 'var(--brand-dim)' : 'var(--glass-bg)'};
                    color:${active ? 'var(--brand)' : 'var(--text-muted)'};
                ">
                    <i class="fa-solid ${o.icon}" style="font-size:1.3rem;"></i>
                    <span style="font-size:.8rem;font-weight:700;">${o.label}</span>
                    <span style="font-size:.65rem;opacity:.7;">${o.desc}</span>
                </button>`;
            }).join('');

            window.HMSApp.openModal(`
                <div style="min-width:300px;max-width:420px;">
                    <div class="modal-header">
                        <div>
                            <div style="font-weight:700;font-size:1rem;color:var(--text-primary);">Preferências</div>
                            <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px;">${email}</div>
                        </div>
                        <button class="modal-close" id="prefs-close"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div style="padding:16px 20px 24px;">
                        <div style="font-size:.68rem;font-weight:700;color:var(--text-muted);letter-spacing:.08em;margin-bottom:14px;">VISUALIZAÇÃO PADRÃO AO ABRIR MÚSICA</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                            ${optsHtml}
                        </div>

                        <!-- Somente Leitura toggle -->
                        <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--glass-border);">
                            <div style="font-size:.68rem;font-weight:700;color:var(--text-muted);letter-spacing:.08em;margin-bottom:12px;">MODO DE ACESSO</div>
                            <button id="pref-readonly-toggle" style="
                                width:100%;display:flex;align-items:center;gap:12px;
                                padding:12px 16px;border-radius:14px;cursor:pointer;transition:all .2s;
                                font-family:var(--font-ui);
                                border:2px solid ${readOnly ? '#f59e0b' : 'var(--glass-border)'};
                                background:${readOnly ? 'rgba(245,158,11,.12)' : 'var(--glass-bg)'};
                                color:${readOnly ? '#f59e0b' : 'var(--text-muted)'};
                                text-align:left;
                            ">
                                <i class="fa-solid fa-lock" style="font-size:1.1rem;flex-shrink:0;"></i>
                                <div style="flex:1;">
                                    <div style="font-size:.82rem;font-weight:700;">Somente Leitura</div>
                                    <div style="font-size:.68rem;opacity:.75;margin-top:2px;">Desativa botões de edição — dados continuam online</div>
                                </div>
                                <div id="pref-readonly-pill" style="
                                    padding:3px 10px;border-radius:99px;font-size:.68rem;font-weight:700;
                                    background:${readOnly ? '#f59e0b' : 'rgba(255,255,255,.08)'};
                                    color:${readOnly ? '#000' : 'var(--text-muted)'};
                                    transition:all .2s;
                                ">${readOnly ? 'ATIVO' : 'INATIVO'}</div>
                            </button>
                        </div>
                    </div>
                </div>
            `);

            document.getElementById('prefs-close')?.addEventListener('click', () => window.HMSApp.closeModal());

            document.querySelectorAll('.pref-opt').forEach(btn => {
                btn.addEventListener('click', () => {
                    const pref = btn.dataset.pref;
                    localStorage.setItem('hms_show_pref', pref);
                    // Atualizar visual
                    document.querySelectorAll('.pref-opt').forEach(b => {
                        const on = b.dataset.pref === pref;
                        b.style.borderColor = on ? 'var(--brand)' : 'var(--glass-border)';
                        b.style.background  = on ? 'var(--brand-dim)' : 'var(--glass-bg)';
                        b.style.color       = on ? 'var(--brand)' : 'var(--text-muted)';
                    });
                    const label = btn.querySelector('span').textContent;
                    window.HMSApp.showToast(`Padrão: ${label}`, 'success');
                    setTimeout(() => window.HMSApp.closeModal(), 700);
                });
            });

            // Read-only toggle
            document.getElementById('pref-readonly-toggle')?.addEventListener('click', () => {
                const newVal = !window.HMSReadOnly.isActive();
                window.HMSReadOnly.set(newVal);

                // Update button visual in-place
                const toggleBtn = document.getElementById('pref-readonly-toggle');
                const pill      = document.getElementById('pref-readonly-pill');
                if (toggleBtn) {
                    toggleBtn.style.borderColor = newVal ? '#f59e0b' : 'var(--glass-border)';
                    toggleBtn.style.background  = newVal ? 'rgba(245,158,11,.12)' : 'var(--glass-bg)';
                    toggleBtn.style.color       = newVal ? '#f59e0b' : 'var(--text-muted)';
                }
                if (pill) {
                    pill.textContent        = newVal ? 'ATIVO' : 'INATIVO';
                    pill.style.background   = newVal ? '#f59e0b' : 'rgba(255,255,255,.08)';
                    pill.style.color        = newVal ? '#000' : 'var(--text-muted)';
                }
                window.HMSApp.showToast(
                    newVal ? '🔒 Somente Leitura ativado' : '🔓 Somente Leitura desativado',
                    newVal ? 'warning' : 'success'
                );
            });
        },

        // ── Logout ───────────────────────────────────────────────
        _handleLogout: async function () {
            if (!confirm('Deseja sair do HMS?')) return;
            try {
                window.HMSApp.showLoading();
                // Limpa cache offline ANTES de signOut (garante que SIGNED_OUT não restaura)
                localStorage.removeItem('hms-cached-user');
                await window.HMSAuth.logout();
            } catch (err) {
                window.HMSApp.showToast('Erro ao sair: ' + err.message, 'error');
                window.HMSApp.hideLoading();
            }
        },
    };

    window.App = App;

    // Bootstrap
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => App.init());
    } else {
        App.init();
    }

    console.info('[HMS] App controller loaded.');
})();
