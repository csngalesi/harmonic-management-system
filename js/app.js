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
            try {
                const session = await window.HMSAuth.getSession();
                if (session) {
                    // Salva usuário em cache para uso offline futuro
                    localStorage.setItem('hms-cached-user', JSON.stringify({
                        id:    session.user.id,
                        email: session.user.email,
                        user_metadata: session.user.user_metadata || {},
                    }));
                    App._showApp(session.user);
                } else {
                    // Sem sessão — tenta cache offline
                    const cached = App._getCachedUser();
                    if (cached && !navigator.onLine) {
                        console.info('[HMS] Offline: usando usuário em cache', cached.email);
                        App._showApp(cached);
                    } else {
                        App._showLogin();
                    }
                }
            } catch (err) {
                console.error('[HMS] Session check failed:', err);
                // Se offline, tenta cache mesmo com erro
                const cached = App._getCachedUser();
                if (cached && !navigator.onLine) {
                    console.info('[HMS] Offline fallback:', cached.email);
                    App._showApp(cached);
                } else {
                    App._showLogin();
                }
            } finally {
                window.HMSApp.hideLoading();
            }

            window.HMSAuth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_IN' && session) {
                    // Atualiza cache a cada login bem-sucedido
                    localStorage.setItem('hms-cached-user', JSON.stringify({
                        id:    session.user.id,
                        email: session.user.email,
                        user_metadata: session.user.user_metadata || {},
                    }));
                    App._showApp(session.user);
                } else if (event === 'SIGNED_OUT') {
                    // Se offline, SIGNED_OUT é falso alarme (token refresh falhou)
                    // Só desloga de verdade se o usuário clicou em logout (online)
                    if (!navigator.onLine && App._getCachedUser()) {
                        console.info('[HMS] Offline SIGNED_OUT ignorado — mantendo sessão em cache');
                        return;
                    }
                    // Limpa cache só no logout real (online)
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

        // ── Navigation ───────────────────────────────────────────
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

        // ── Preferências do Usuário ────────────────────────────────
        _openUserPrefs: function () {
            const email   = document.getElementById('user-email')?.textContent || '';
            const current = localStorage.getItem('hms_show_pref') || 'acor';

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
