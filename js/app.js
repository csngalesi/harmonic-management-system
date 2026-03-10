/**
 * HMS — SPA App Controller
 * Session management, routing, sidebar, modals, and global UI helpers.
 */
(function () {
    'use strict';

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
        studies7:   window.Studies7Component,
        fretboard7:     window.Fretboard7Component,
        melodicStudies: window.MelodicStudiesComponent,
    };

    // ── App Controller ───────────────────────────────────────────
    const App = {
        _currentRoute: null,

        init: async function () {
            window.HMSApp.showLoading();
            try {
                const session = await window.HMSAuth.getSession();
                if (session) {
                    App._showApp(session.user);
                } else {
                    App._showLogin();
                }
            } catch (err) {
                console.error('[HMS] Session check failed:', err);
                App._showLogin();
            } finally {
                window.HMSApp.hideLoading();
            }

            window.HMSAuth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_IN' && session) {
                    App._showApp(session.user);
                } else if (event === 'SIGNED_OUT') {
                    App._showLogin();
                }
            });
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
            if (!App._currentRoute) App.navigate('repertoire');
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

            window.addEventListener('resize', () => {
                if (!App._isMobile()) App._closeMobileSidebar();
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
        navigate: function (route, payload) {
            if (!ROUTES[route]) {
                console.warn('[HMS] Unknown route:', route);
                return;
            }

            App._currentRoute = route;

            document.querySelectorAll('.nav-link[data-route]').forEach(link => {
                link.classList.toggle('active', link.dataset.route === route);
            });

            ROUTES[route].render(payload);
        },

        // ── Logout ───────────────────────────────────────────────
        _handleLogout: async function () {
            if (!confirm('Deseja sair do HMS?')) return;
            try {
                window.HMSApp.showLoading();
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
