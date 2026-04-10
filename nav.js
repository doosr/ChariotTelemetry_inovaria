/**
 * INTELLIMETTRY — SHARED NAVIGATION  v3.0
 * nav.js — sidebar · topbar · quick-panel · theme switcher · search · live stats
 */
(function () {
    'use strict';

    const PAGES = {
        'profil.html': { label: '👤 Mon Profil', icon: '🔒', roles: ['Admin', 'System Admin', 'Super Admin', 'Technicien', 'Lecture seule'] },
        'fleet.html': { label: 'Gestion de Flotte', icon: '🚜', roles: ['Admin', 'System Admin', 'Super Admin'] },
        'maintenance.html': { label: 'Maintenance Prev.', icon: '🔧', roles: ['Admin', 'System Admin', 'Super Admin', 'Technicien'] },
        //        'dashboard.html': { label: 'Dashboard Temps Réel', icon: '📊', roles: ['Admin', 'System Admin', 'Super Admin', 'Technicien'] },
        'technicien.html': { label: 'Espace Technicien', icon: '🔧', roles: ['Admin', 'System Admin', 'Super Admin', 'Technicien', 'Lecture seule'] },
        'superadmin.html': { label: 'Super Admin', icon: '👑', roles: ['Super Admin'] },
        'admins.html': { label: 'Gérer les Admins', icon: '👥', roles: ['Super Admin'] },
    };

    /* ─────────────────────────── UTILS ─────────────────────────── */
    const getSession = () => { try { return JSON.parse(localStorage.getItem('admin-session') || '{}'); } catch { return {}; } };
    const currentPage = () => window.location.pathname.split('/').pop() || 'fleet.html';
    const timeAgo = d => {
        const s = Math.floor((Date.now() - new Date(d)) / 1000);
        if (s < 60) return `${s}s`;
        if (s < 3600) return `${Math.floor(s / 60)}min`;
        if (s < 86400) return `${Math.floor(s / 3600)}h`;
        return `${Math.floor(s / 86400)}j`;
    };

    /* COMPATIBILITY HELPER */
    const fetchWithT = async (u, o = {}, t = 5000) => {
        if (AbortSignal && AbortSignal.timeout) return fetch(u, { ...o, signal: AbortSignal.timeout(t) });
        const c = new AbortController();
        const tid = setTimeout(() => c.abort(), t);
        try { const r = await fetch(u, { ...o, signal: c.signal }); clearTimeout(tid); return r; }
        catch (e) { clearTimeout(tid); throw e; }
    };

    /* ─────────────────── NOTIFICATION SOUND SYSTEM ──────────────── */
    // Uses the Web Audio API to synthesize a pleasant bell sound.
    // No external audio file needed — works 100% offline.
    let _audioCtx = null;

    function _getAudioCtx() {
        if (!_audioCtx) {
            try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; }
        }
        // Resume suspended context (browser requires user gesture first)
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        return _audioCtx;
    }

    function playNotificationSound(type) {
        const ctx = _getAudioCtx();
        if (!ctx) return;

        const playTones = () => {
            // Two-tone pleasant chime
            const notes = type === 'danger'
                ? [880, 660]   // High pitched alarm tones for danger
                : [523, 659];  // C5 → E5 pleasant chime for info/warning

            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);

                gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.15);
                gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + i * 0.15 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.6);

                osc.start(ctx.currentTime + i * 0.15);
                osc.stop(ctx.currentTime + i * 0.15 + 0.6);
            });
        };

        if (ctx.state === 'suspended') {
            ctx.resume().then(playTones).catch(() => { });
        } else {
            playTones();
        }
    }

    // Expose globally so other pages can trigger manually
    window.intellimettryPlaySound = playNotificationSound;


    // Track last unread count to detect new arrivals
    let _lastUnreadCount = parseInt(localStorage.getItem('_im_lastUnread') || '0', 10);
    let _soundUnlocked = false;

    // Unlock audio context on first user interaction (browser requirement)
    function _unlockAudio() {
        _getAudioCtx();
        _soundUnlocked = true;
        document.removeEventListener('click', _unlockAudio);
        document.removeEventListener('keydown', _unlockAudio);
    }
    document.addEventListener('click', _unlockAudio, { once: true });
    document.addEventListener('keydown', _unlockAudio, { once: true });

    // ── First-run initialization flag ──
    // On first poll, just record the current count WITHOUT playing a sound.
    // Sound only plays when the count INCREASES after page load.
    let _notifInitialized = false;

    function _checkForNewNotifications(unreadCount, latestType) {
        if (!_notifInitialized) {
            // First call: silently set the baseline — no sound for existing notifications
            _lastUnreadCount = unreadCount;
            localStorage.setItem('_im_lastUnread', unreadCount);
            _notifInitialized = true;
            console.log(`[NAV] 🔔 Baseline notifications: ${unreadCount} unread`);
            return;
        }

        if (unreadCount > _lastUnreadCount) {
            // Genuinely NEW notification arrived after page load!
            const diff = unreadCount - _lastUnreadCount;
            console.log(`[NAV] 🔔 ${diff} nouvelle(s) notification(s) en temps réel!`);
            playNotificationSound(latestType || 'info');
        }
        _lastUnreadCount = unreadCount;
        localStorage.setItem('_im_lastUnread', unreadCount);
    }

    /* ────────────────────── THEME ENGINE ───────────────────────── */
    const THEME_KEY = 'intellimettry-theme'; // 'dark' | 'light' | 'system'

    function applyTheme(mode) {
        // Ne pas toucher au thème du dashboard — il gère le sien en interne
        const page = currentPage();
        if (page === 'dashboard.html') return;

        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const dark = mode === 'dark' || (mode === 'system' && prefersDark);
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');

        // We can still set variables for global body bg to avoid flashes
        document.body.style.background = getComputedStyle(document.documentElement).getPropertyValue('--body-bg');

        /* Update active indicator in switcher */
        document.querySelectorAll('.theme-opt').forEach(el => {
            el.classList.toggle('active', el.dataset.theme === mode);
        });
    }

    function setTheme(mode) {
        localStorage.setItem(THEME_KEY, mode);
        applyTheme(mode);
    }

    function initTheme() {
        const saved = localStorage.getItem(THEME_KEY) || 'dark';
        applyTheme(saved);
        /* Watch system preference */
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if ((localStorage.getItem(THEME_KEY) || 'dark') === 'system') applyTheme('system');
        });
    }

    /* expose globally for onclick */
    window.intellimettrySetTheme = setTheme;

    /* ───────────────────── BUILD SIDEBAR HTML ───────────────────── */
    function buildSidebar(session, role, notifs) {
        const page = currentPage();
        const badge = notifs.length > 0
            ? `<span class="nav-item-badge">${notifs.length > 9 ? '9+' : notifs.length}</span>` : '';

        const navItems = Object.entries(PAGES)
            .filter(([, c]) => c.roles.includes(role))
            .map(([href, c]) => `
            <a class="nav-item ${page === href ? 'active' : ''}" href="${href}">
                <span class="nav-item-icon">${c.icon}</span>
                <span class="nav-item-label">${c.label}</span>
            </a>`).join('');

        const canAdd = ['Admin', 'System Admin', 'Super Admin'].includes(role);
        const initials = (session.name || session.email || 'U')[0].toUpperCase();
        const displayName = session.name || (session.email || 'Utilisateur').split('@')[0];
        const avatarUrl = session.avatar || null;
        const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';

        return `
        <aside class="intellimettry-sidebar" id="intellimettrySidebar">

            <!-- Toggle button -->
            <div class="nav-toggle" id="navToggle" title="Réduire/Agrandir">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" id="navToggleIcon">
                    <polyline points="15 18 9 12 15 6"/>
                </svg>
            </div>

            <!-- Brand -->
            <a class="nav-brand" href="/">

                <div class="nav-brand-icon">🚜</div>
                <div class="nav-brand-text">
                    <span class="nav-brand-title">INTELLIMETTRY</span>
                    <span class="nav-brand-sub">Monitoring v2.5</span>
                </div>
            </a>

            <!-- Live status -->
            <div class="nav-status-bar">
                <div class="nav-status-dot" id="navStatusDot"></div>
                <span class="nav-status-text" id="navStatusText">Connexion...</span>
            </div>

            <!-- Navigation -->
            <nav class="nav-menu">
                <div class="nav-section-label">Navigation</div>
                ${navItems}

                <!-- Search quick link -->
                <div class="nav-section-label" style="margin-top:8px;">Outils</div>

                <div class="nav-item" onclick="intellimettryOpenSearch()" title="Recherche rapide (Ctrl+K)">
                    <span class="nav-item-icon">🔍</span>
                    <span class="nav-item-label">Recherche rapide</span>
                    <span style="font-size:0.6rem;color:var(--nav-muted);margin-left:auto;letter-spacing:1px;">⌘K</span>
                </div>

                <div class="nav-item" onclick="intellimettryOpenQuickPanel('notifs')" title="Notifications">
                    <span class="nav-item-icon">🔔</span>
                    <span class="nav-item-label">Notifications</span>
                    <span class="nav-item-badge" id="sidebarNotifBadge" style="display:${notifs.length > 0 ? 'flex' : 'none'}">${notifs.length > 9 ? '9+' : notifs.length}</span>
                </div>

               

                ${canAdd ? `
                <div class="nav-item" onclick="if(typeof openAddModal==='function') openAddModal();" title="Ajouter un chariot">
                    <span class="nav-item-icon">➕</span>
                    <span class="nav-item-label">Ajouter un chariot</span>
                </div>
                <div class="nav-item" onclick="intellimettryExportPDF()" title="Exporter les données en PDF">
                    <span class="nav-item-icon">📥</span>
                    <span class="nav-item-label">Exporter PDF</span>
                </div>` : ''}
            </nav>

            <!-- Live Mini Stats -->
            <div class="nav-stats-mini" id="navStatsMini">
                <div class="ns-card" title="Chariots en ligne">
                    <div class="ns-val" id="ns-online" style="color:#34c759">—</div>
                    <div class="ns-lbl">En ligne</div>
                </div>
                <div class="ns-card" title="Hors ligne">
                    <div class="ns-val" id="ns-offline" style="color:#ff3b30">—</div>
                    <div class="ns-lbl">Hors ligne</div>
                </div>
                <div class="ns-card" title="Alertes actives">
                    <div class="ns-val" id="ns-alerts" style="color:#ffa500">—</div>
                    <div class="ns-lbl">Alertes</div>
                </div>
                <div class="ns-card" title="Total flotte">
                    <div class="ns-val" id="ns-total" style="color:#00d4ff">—</div>
                    <div class="ns-lbl">Total</div>
                </div>
            </div>

            <!-- Theme Switcher -->
            <div class="nav-theme-switcher" id="navThemeSwitcher">
                <div class="nav-section-label" style="padding-bottom:6px;">Apparence</div>
                <div class="theme-switcher-row">
                    <button class="theme-opt ${savedTheme === 'light' ? 'active' : ''}" data-theme="light" onclick="intellimettrySetTheme('light')" title="Thème clair">
                        <span class="theme-opt-icon">☀️</span>
                        <span class="theme-opt-label">Clair</span>
                    </button>
                    <button class="theme-opt ${savedTheme === 'dark' ? 'active' : ''}" data-theme="dark" onclick="intellimettrySetTheme('dark')" title="Thème sombre">
                        <span class="theme-opt-icon">🌙</span>
                        <span class="theme-opt-label">Sombre</span>
                    </button>
                    <button class="theme-opt ${savedTheme === 'system' ? 'active' : ''}" data-theme="system" onclick="intellimettrySetTheme('system')" title="Suivre le système">
                        <span class="theme-opt-icon">🖥️</span>
                        <span class="theme-opt-label">Système</span>
                    </button>
                </div>
            </div>

            <!-- User Footer -->
            <div class="nav-footer">
                <div class="nav-avatar" id="navAvatar" onclick="window.location.href='profil.html'" title="Mon Profil" style="${avatarUrl ? `background-image:url(${avatarUrl});background-size:cover;color:transparent;` : ''}">
                    ${!avatarUrl ? initials : ''}
                </div>
                <div class="nav-user-info" onclick="window.location.href='profil.html'" style="cursor:pointer;" title="Mon Profil">
                    <div class="nav-user-name" id="navUserName">${displayName}</div>
                    <div class="nav-user-role" id="navUserRole">${role}</div>
                </div>
                <div style="margin-left:auto;cursor:pointer;color:var(--nav-muted);font-size:1rem;" onclick="intellimettryLogout()" title="Déconnexion">🚪</div>
            </div>
        </aside>`;
    }

    /* ───────────────────────── BUILD TOPBAR ────────────────────── */
    function buildTopbar(page, session) {
        const cfg = PAGES[page] || { label: 'IntelliMettry', icon: '🚜' };
        const avatarUrl = session?.avatar || null;
        const initials = (session?.name || session?.email || 'U')[0].toUpperCase();

        return `
        <div class="intellimettry-topbar">
            <div class="topbar-left">
                <button class="topbar-hamburger" id="hamburgerBtn" title="Menu">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                    </svg>
                </button>
                <div>
                    <div class="topbar-page-title">${cfg.icon} ${cfg.label.toUpperCase()}</div>
                </div>
            </div>
            <div class="topbar-right">
                <!-- Search bar (desktop) -->
                <div class="topbar-search" id="topbarSearch" onclick="intellimettryOpenSearch()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <span>Rechercher...</span>
                    <kbd>⌘K</kbd>
                </div>
                <div class="topbar-clock" id="navClock">--:--:--</div>
                <div class="topbar-bell" id="topbarBell" onclick="intellimettryOpenQuickPanel('${session?.role === 'Super Admin' || session?.role === 'System Admin' ? 'notifsReseau' : 'notifsChariot'}')" title="Notifications">
                    🔔
                    <span class="topbar-bell-badge" id="topbarBellBadge">0</span>
                </div>
                <!-- VUE IMPERSONNELLE -->
                ${localStorage.getItem('superadmin-backup') ? `
                <button onclick="intellimettryLeaveImpersonation()" style="background:rgba(255,59,48,0.15);border:1px solid #ff3b30;color:#ff3b30;border-radius:20px;padding:4px 12px;font-size:0.75rem;font-weight:bold;cursor:pointer;margin-right:10px;animation: glow2 2s infinite;">
                    🔴 Quitter la vue Admin
                </button>
                ` : ''}
                <div class="topbar-avatar-btn" id="topbarAvatar" onclick="window.location.href='profil.html'" title="Mon Profil" style="${avatarUrl ? `background-image:url(${avatarUrl});background-size:cover;color:transparent;` : ''}">
                    ${!avatarUrl ? initials : ''}
                </div>
            </div>
        </div>`;
    }

    /* ───────────────────── BUILD QUICK PANEL ───────────────────── */
    function buildQuickPanel(notifs) {
        const session = getSession();
        const role = session.role || 'Lecture seule';
        const isSuperAdmin = role === 'Super Admin' || role === 'System Admin';

        const notifsReseau = notifs.filter(n => !n.deviceId || ['Global', 'System', '🔐 SECURITE'].includes(n.deviceId));
        const notifsChariot = notifs.filter(n => n.deviceId && !['Global', 'System', '🔐 SECURITE'].includes(n.deviceId));

        const buildNotifHtml = (arr, isChariot) => {
            if (arr.length === 0) {
                return `<div style="text-align:center;padding:3rem 1rem;color:#555560;">
                    <div style="font-size:3rem;margin-bottom:1rem;opacity:0.3">🔕</div>
                    <p style="font-size:0.85rem;">Aucune alerte active</p>
                </div>`;
            }
            return arr.slice(0, 40).map(n => {
                let chariotTag = '';
                if (isChariot) {
                    const machine = searchForklifts.find(m => m.deviceId === n.deviceId);
                    const cName = machine ? `${machine.name} (${machine.model})` : n.deviceId;
                    chariotTag = `<div style="font-size:0.65rem;padding:3px 8px;background:rgba(255,165,0,0.15);color:#ffa500;border-radius:10px;border:1px solid rgba(255,165,0,0.3);margin-left:auto;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;" title="${cName}">${cName}</div>`;
                }

                return `
                <div class="notif-item ${n.type || 'info'} ${n.isRead ? 'read' : 'unread'}" onclick="intellimettryMarkAsRead('${n._id}')">
                    <div class="notif-icon">${n.type === 'danger' ? '🚨' : n.type === 'warning' ? '⚠️' : 'ℹ️'}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <div class="notif-title">${n.title || 'Alerte'}</div>
                            ${!n.isRead ? '<div class="unread-dot"></div>' : ''}
                            ${chariotTag}
                        </div>
                        <div class="notif-msg">${n.message || ''}</div>
                        <div class="notif-time">🕐 ${timeAgo(n.timestamp || new Date())}</div>
                    </div>
                </div>`;
            }).join('');
        };

        const htmlReseau = buildNotifHtml(notifsReseau, false);
        const htmlChariot = buildNotifHtml(notifsChariot, true);

        return `
        <!-- Quick Panel -->
        <div class="intellimettry-quick-panel" id="intellimettryQuickPanel">
            <div class="qp-header">
                <div class="qp-title">⚡ PANNEAU RAPIDE</div>
                <button class="qp-close" onclick="intellimettryClosePanel()">✕</button>
            </div>
            <div class="qp-tabs">
                ${isSuperAdmin ? `<button class="qp-tab active" data-panel="notifsReseau" onclick="switchQpTab('notifsReseau')">🌐 Réseau</button>` : ''}
                <button class="qp-tab ${isSuperAdmin ? '' : 'active'}" data-panel="notifsChariot" onclick="switchQpTab('notifsChariot')">🚜 Chariots</button>
            </div>
            <div class="qp-body">

                ${isSuperAdmin ? `
                <!-- NOTIFS RESEAU -->
                <div class="qp-tab-panel active" id="qpNotifsReseau">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <span id="qpNotifsReseauCount" style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1.5px;color:#86868b;font-weight:700;">
                            ${notifsReseau.length} alerte(s)
                        </span>
                        <button onclick="intellimettryClearNotifs('reseau')" style="background:none;border:none;cursor:pointer;font-size:0.72rem;color:#86868b;text-decoration:underline;">Tout effacer</button>
                    </div>
                    <div id="qpNotifReseauList">${htmlReseau}</div>
                </div>` : ''}

                <!-- NOTIFS CHARIOTS -->
                <div class="qp-tab-panel ${isSuperAdmin ? '' : 'active'}" id="qpNotifsChariot">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <span id="qpNotifsChariotCount" style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1.5px;color:#86868b;font-weight:700;">
                            ${notifsChariot.length} alerte(s)
                        </span>
                        <button onclick="intellimettryClearNotifs('chariots')" style="background:none;border:none;cursor:pointer;font-size:0.72rem;color:#86868b;text-decoration:underline;">Tout effacer</button>
                    </div>
                    <div id="qpNotifChariotList">${htmlChariot}</div>
                </div>
            </div>
        </div>

        <!-- Search Modal -->
        <div class="intellimettry-search-modal" id="intellimettrySearchModal">
            <div class="intellimettry-search-box">
                <div class="intellimettry-search-input-wrap">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input type="text" id="intellimettrySearchInput" placeholder="Rechercher un chariot, une page, une action..." autocomplete="off">
                    <kbd onclick="intellimettryCloseSearch()">Esc</kbd>
                </div>
                <div class="intellimettry-search-results" id="intellimettrySearchResults">
                    <div class="intellimettry-search-hint">Tapez pour rechercher…</div>
                </div>
                <div class="intellimettry-search-footer">
                    <span><kbd>↑↓</kbd> Naviguer</span>
                    <span><kbd>↵</kbd> Sélectionner</span>
                    <span><kbd>Esc</kbd> Fermer</span>
                </div>
            </div>
        </div>

        <!-- Overlay -->
        <div class="intellimettry-overlay" id="intellimettryOverlay" onclick="intellimettryClosePanel(); intellimettryCloseSearch();"></div>`;
    }

    /* ───────────────────────── EXTRA CSS ───────────────────────── */
    function injectExtraCSS() {
        if (document.getElementById('intellimettry-nav-extra')) return;
        const style = document.createElement('style');
        style.id = 'intellimettry-nav-extra';
        style.textContent = `
            /* ── Theme switcher ── */
            .nav-theme-switcher {
                padding: 10px 10px 6px;
                border-top: 1px solid var(--nav-border);
            }
            .intellimettry-sidebar.mini .nav-theme-switcher { display: none; }

            .theme-switcher-row {
                display: flex;
                gap: 4px;
            }
            .theme-opt {
                flex: 1;
                padding: 7px 4px;
                border-radius: 8px;
                border: 1px solid rgba(255,255,255,0.07);
                background: rgba(255,255,255,0.03);
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 3px;
                transition: all 0.2s;
                color: var(--nav-muted);
            }
            .theme-opt-icon  { font-size: 0.9rem; }
            .theme-opt-label { font-size: 0.58rem; font-weight: 700; letter-spacing: 0.5px; font-family:'Inter',sans-serif; text-transform:uppercase; }
            .theme-opt.active {
                background: rgba(0,212,255,0.12);
                border-color: rgba(0,212,255,0.3);
                color: #00d4ff;
            }
            .theme-opt:hover:not(.active) {
                background: rgba(255,255,255,0.06);
                color: var(--nav-text);
            }

            /* ── Light theme overrides ── */
            html[data-theme="light"] .intellimettry-sidebar          { background: rgba(248,250,252,0.97); border-right-color: rgba(0,0,0,0.08); }
            html[data-theme="light"] .nav-brand-title       { color: #0f172a; }
            html[data-theme="light"] .nav-item              { color: #475569; }
            html[data-theme="light"] .nav-item:hover        { background: rgba(0,0,0,0.04); color: #0f172a; }
            html[data-theme="light"] .nav-item.active       { background: rgba(0,212,255,0.08); color: #0072aa; }
            html[data-theme="light"] .nav-section-label     { color: #94a3b8; }
            html[data-theme="light"] .ns-card               { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.06); }
            html[data-theme="light"] .intellimettry-topbar            { background: rgba(248,250,252,0.95); border-bottom-color: rgba(0,0,0,0.07); }
            html[data-theme="light"] .topbar-page-title     { color: #0f172a; }
            html[data-theme="light"] .topbar-breadcrumb     { color: #64748b; }
            html[data-theme="light"] .topbar-search         { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.08); color: #64748b; }
            html[data-theme="light"] .topbar-clock          { background: rgba(0,100,160,0.07); border-color: rgba(0,100,160,0.15); color: #006699; }
            html[data-theme="light"] .topbar-bell           { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.08); color: #475569; }
            html[data-theme="light"] .intellimettry-quick-panel       { background: rgba(250,252,255,0.98); }
            html[data-theme="light"] .notif-item            { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.05); }
            html[data-theme="light"] .notif-title           { color: #0f172a; }
            html[data-theme="light"] .notif-msg             { color: #475569; }
            html[data-theme="light"] .sys-key               { color: #64748b; }
            html[data-theme="light"] .qp-title              { color: #0f172a; }
            html[data-theme="light"] .qp-tab                { color: #475569; }
            html[data-theme="light"] .qp-tab.active         { color: #0072aa; border-bottom-color: #0072aa; }
            html[data-theme="light"] .intellimettry-search-box        { background: #fff; border-color: rgba(0,0,0,0.1); }
            html[data-theme="light"] #intellimettrySearchInput        { color: #0f172a; }
            html[data-theme="light"] .intellimettry-search-hint       { color: #94a3b8; }
            html[data-theme="light"] .intellimettry-search-footer     { border-top-color: rgba(0,0,0,0.07); color: #94a3b8; }
            html[data-theme="light"] .theme-opt             { border-color: rgba(0,0,0,0.08); background: rgba(0,0,0,0.02); color: #475569; }
            html[data-theme="light"] .theme-opt.active      { background: rgba(0,100,160,0.08); border-color: rgba(0,100,160,0.25); color: #0072aa; }
            html[data-theme="light"] body,
            html[data-theme="light"] .intellimettry-content           { background-color: #f1f5f9; color: #0f172a; }

            /* Fix dropdown visibility */
            select option, select optgroup { background-color: #0f172a; color: #f5f5f7; }
            html[data-theme="light"] select option, html[data-theme="light"] select optgroup { background-color: #ffffff; color: #0f172a; }

            .notif-item.unread { background: rgba(0,212,255,0.04); border-left: 3px solid #00d4ff; }
            .notif-item.read { opacity: 0.7; border-left: 3px solid transparent; }
            
            .unread-dot {
                width: 8px;
                height: 8px;
                background: #00d4ff;
                border-radius: 50%;
                box-shadow: 0 0 8px #00d4ff;
            }

            /* ── Topbar search pill ── */
            .topbar-search {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 7px 14px;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 10px;
                cursor: pointer;
                color: var(--nav-muted);
                font-size: 0.8rem;
                transition: all 0.2s;
                min-width: 200px;
            }
            .topbar-search:hover {
                background: rgba(0,212,255,0.07);
                border-color: rgba(0,212,255,0.2);
                color: #00d4ff;
            }
            .topbar-search kbd {
                margin-left: auto;
                font-size: 0.62rem;
                padding: 2px 6px;
                border-radius: 4px;
                background: rgba(255,255,255,0.07);
                border: 1px solid rgba(255,255,255,0.1);
                color: var(--nav-muted);
                font-family: 'Inter', sans-serif;
            }

            .topbar-avatar-btn {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: linear-gradient(135deg, #00d4ff, #7f5af0);
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'Orbitron', monospace;
                font-size: 0.75rem;
                font-weight: 900;
                color: #fff;
                cursor: pointer;
                box-shadow: 0 0 12px rgba(0,212,255,0.2);
                transition: transform 0.2s;
            }
            .topbar-avatar-btn:hover { transform: scale(1.1); }

            @media (max-width:768px) {
                .topbar-search { display: none; }
            }

            /* ── QP action buttons ── */
            .qp-action-btn {
                width: 100%;
                padding: 9px 14px;
                border-radius: 9px;
                border: 1px solid;
                cursor: pointer;
                font-family: 'Inter', sans-serif;
                font-size: 0.8rem;
                font-weight: 700;
                letter-spacing: 0.5px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: all 0.2s;
            }
            .qp-action-btn.primary { background: rgba(0,212,255,0.08); border-color: rgba(0,212,255,0.2); color: #00d4ff; }
            .qp-action-btn.primary:hover { background: rgba(0,212,255,0.16); }
            .qp-action-btn.success { background: rgba(52,199,89,0.08); border-color: rgba(52,199,89,0.2); color: #34c759; }
            .qp-action-btn.success:hover { background: rgba(52,199,89,0.16); }
            .qp-action-btn.danger  { background: rgba(255,59,48,0.08); border-color: rgba(255,59,48,0.2); color: #ff3b30; }
            .qp-action-btn.danger:hover  { background: rgba(255,59,48,0.16); }

            /* ── Search Modal ── */
            .intellimettry-search-modal {
                display: none;
                position: fixed;
                inset: 0;
                z-index: 1000;
                align-items: flex-start;
                justify-content: center;
                padding-top: 100px;
            }
            .intellimettry-search-modal.open { display: flex; }

            .intellimettry-search-box {
                width: 100%;
                max-width: 600px;
                background: rgba(6,10,24,0.98);
                border: 1px solid rgba(0,212,255,0.2);
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 30px 80px rgba(0,0,0,0.6), 0 0 60px rgba(0,212,255,0.06);
                backdrop-filter: blur(30px);
                animation: searchDrop 0.2s ease;
            }

            @keyframes searchDrop {
                from { opacity:0; transform: translateY(-20px) scale(0.97); }
                to   { opacity:1; transform: translateY(0) scale(1); }
            }

            .intellimettry-search-input-wrap {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 16px 20px;
                border-bottom: 1px solid rgba(255,255,255,0.07);
                color: #86868b;
            }

            #intellimettrySearchInput {
                flex: 1;
                background: none;
                border: none;
                outline: none;
                color: #f5f5f7;
                font-size: 1rem;
                font-family: 'Inter', sans-serif;
            }
            #intellimettrySearchInput::placeholder { color: #555560; }

            .intellimettry-search-input-wrap kbd {
                font-size: 0.72rem;
                padding: 4px 8px;
                background: rgba(255,255,255,0.06);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 6px;
                cursor: pointer;
                color: #86868b;
                font-family: 'Inter', sans-serif;
            }

            .intellimettry-search-results { max-height: 380px; overflow-y: auto; }
            .intellimettry-search-hint { padding: 20px; color: #555560; font-size: 0.85rem; text-align: center; }

            .search-result-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 13px 20px;
                cursor: pointer;
                transition: background 0.15s;
                border-left: 2px solid transparent;
            }
            .search-result-item:hover, .search-result-item.focused {
                background: rgba(0,212,255,0.06);
                border-left-color: #00d4ff;
            }
            .sri-icon { font-size: 1.1rem; flex-shrink: 0; }
            .sri-label { font-size: 0.9rem; font-weight: 600; color: #f5f5f7; }
            .sri-sub   { font-size: 0.72rem; color: #86868b; margin-top: 1px; }
            .sri-badge { margin-left:auto; font-size:0.62rem; padding:2px 8px; border-radius:20px; font-weight:700; }
            .sri-badge.page   { background: rgba(0,212,255,0.1); color: #00d4ff; border: 1px solid rgba(0,212,255,0.2); }
            .sri-badge.action { background: rgba(52,199,89,0.1); color: #34c759; border: 1px solid rgba(52,199,89,0.2); }
            .sri-badge.fleet  { background: rgba(255,165,0,0.1); color: #ffa500; border: 1px solid rgba(255,165,0,0.2); }

            .intellimettry-search-footer {
                display: flex;
                gap: 20px;
                padding: 10px 20px;
                border-top: 1px solid rgba(255,255,255,0.07);
                font-size: 0.7rem;
                color: #555560;
            }
            .intellimettry-search-footer kbd {
                display: inline-block;
                padding: 2px 6px;
                background: rgba(255,255,255,0.06);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 4px;
                margin-right: 4px;
                font-family: 'Inter', sans-serif;
            }
        `;
        document.head.appendChild(style);
    }

    /* ───────────────────────── INJECT ──────────────────────────── */
    async function init() {
        const session = getSession();
        const role = session.role || 'Lecture seule';
        const page = currentPage();

        /* RBAC Security Block */
        if (PAGES[page] && !PAGES[page].roles.includes(role)) {
            console.warn(`IntelliMettry Auth: Rôle '${role}' non autorisé pour la page ${page}`);
            const allowedPage = Object.keys(PAGES).find(p => PAGES[p].roles.includes(role));
            window.location.href = allowedPage || 'login.html';
            return;
        }

        /* Google fonts */
        if (!document.querySelector('link[href*="Orbitron"]')) {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@300;400;600;700;800&display=swap';
            document.head.prepend(l);
        }

        injectExtraCSS();
        initTheme();

        /* Fetch notifications */
        const isLoggedIn = !!session.userId || !!session.email;
        let notifs = [];

        if (isLoggedIn) {
            const ownerId = session.role === 'Admin' ? session.userId : (session.parentAdminId || session.userId);
            try {
                const r = await fetchWithT(`/api/notifications?limit=50${ownerId ? `&ownerId=${ownerId}` : ''}&requesterRole=${session.role}`, {}, 3000);
                if (r.ok) notifs = await r.json();
            } catch (_) { }
        }

        const noWrapPages = ['accueil.html', 'login.html', 'dashboard.html', 'register.html', 'forgot-password.html', ''];
        const isNoWrap = noWrapPages.includes(page);

        if (!isNoWrap) {
            /* Wrap body in layout */
            const origChildren = Array.from(document.body.children);

            const layout = document.createElement('div');
            layout.className = 'intellimettry-layout';

            const main = document.createElement('div');
            main.className = 'intellimettry-main';
            main.id = 'intellimettryMain';

            origChildren.forEach(child => main.appendChild(child));

            /* Topbar at top of main */
            main.insertAdjacentHTML('afterbegin', buildTopbar(page, session));

            /* Wrap rest in .intellimettry-content */
            const topbar = main.querySelector('.intellimettry-topbar');
            const rest = Array.from(main.children).filter(el => el !== topbar);
            const content = document.createElement('div');
            content.className = 'intellimettry-content';
            rest.forEach(el => content.appendChild(el));
            main.appendChild(content);

            /* Assemble */
            layout.insertAdjacentHTML('afterbegin', buildSidebar(session, role, notifs));
            layout.appendChild(main);
            document.body.innerHTML = '';
            document.body.appendChild(layout);
            document.body.insertAdjacentHTML('beforeend', buildQuickPanel(notifs));

            /* Init all */
            initSidebarToggle();
            initClock();
            initSystemStatus();
            initLiveStats();
            initSearch(session, role);
            updateBadges(notifs.length);

            /* Keyboard shortcut */
            document.addEventListener('keydown', e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); intellimettryOpenSearch(); }
                if (e.key === 'Escape') { intellimettryCloseSearch(); intellimettryClosePanel(); }
            });
        } else {
            /* On pages with custom layour or public, just init global logic & theme */
            console.log("IntelliMettry: No-wrap page, theme initialized.");

            // Allow Quick Panel and Search functionality globally by injecting them 
            // into body directly without sidebar wrapper
            document.body.insertAdjacentHTML('beforeend', buildQuickPanel(notifs));

            /* Init non-layout specific JS */
            initSystemStatus();
            if (isLoggedIn) {
                initSearch(session, role);
                updateBadges(notifs.length);
            }

            /* Keyboard shortcut */
            document.addEventListener('keydown', e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); intellimettryOpenSearch(); }
                if (e.key === 'Escape') { intellimettryCloseSearch(); intellimettryClosePanel(); }
            });
        }
    }

    /* ──────────────────── IMPERSONATION BACKUP ────────────────────── */
    window.intellimettryLeaveImpersonation = function () {
        const backup = localStorage.getItem('superadmin-backup');
        if (backup) {
            localStorage.setItem('admin-session', backup);
            localStorage.removeItem('superadmin-backup');
            window.location.href = 'admins.html';
        }
    };

    /* ──────────────────── SIDEBAR TOGGLE ───────────────────────── */
    function initSidebarToggle() {
        const sidebar = document.getElementById('intellimettrySidebar');
        const toggle = document.getElementById('navToggle');
        const hamburger = document.getElementById('hamburgerBtn');

        if (!sidebar) return;

        if (localStorage.getItem('navMini') === 'true') sidebar.classList.add('mini');

        toggle?.addEventListener('click', () => {
            sidebar.classList.toggle('mini');
            localStorage.setItem('navMini', sidebar.classList.contains('mini'));
        });

        hamburger?.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            document.getElementById('intellimettryOverlay')?.classList.toggle('show');
        });
    }

    /* ────────────────────── CLOCK ──────────────────────────────── */
    function initClock() {
        const tick = () => {
            const d = new Date();
            const t = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
            const el = document.getElementById('navClock');
            if (el) el.textContent = t;
        };
        tick(); setInterval(tick, 1000);
    }

    /* ──────────────────── SYSTEM STATUS ────────────────────────── */
    async function checkSystemHealth() {
        const set = (id, txt, cls) => {
            const el = document.getElementById(id);
            if (el) { el.textContent = txt; el.className = cls; }
        };
        try {
            const t0 = Date.now();
            const r = await fetch('/api/auth/status', { signal: AbortSignal.timeout(3000) });
            if (r.ok) {
                set('syBackend', `✓ OK (${Date.now() - t0}ms)`, 'sys-val-ok');
                set('syMongo', '✓ Connecté', 'sys-val-ok');
            } else {
                set('syBackend', '✗ Erreur', 'sys-val-err');
            }
        } catch {
            set('syBackend', '✗ Hors ligne', 'sys-val-err');
            set('syMongo', '? Inconnu', 'sys-val-warn');
        }
        try {
            const r2 = await fetch('/api/status', { signal: AbortSignal.timeout(3000) });
            if (r2.ok) {
                const d = await r2.json();
                const ok = d.mqtt === true || d.mqtt === 'connected';
                set('syMqtt', ok ? '✓ Connecté' : '⚠ Partiel', ok ? 'sys-val-ok' : 'sys-val-warn');
            }
        } catch { set('syMqtt', '? Inconnu', 'sys-val-warn'); }

        const syncEl = document.getElementById('sySync');
        if (syncEl) { syncEl.textContent = new Date().toLocaleTimeString('fr-FR'); syncEl.className = 'sys-val-ok'; }

        const session = getSession();
        if (session.loginTime) {
            const mins = Math.floor((Date.now() - new Date(session.loginTime)) / 60000);
            const el = document.getElementById('syUptime');
            if (el) el.textContent = mins < 60 ? `${mins}min` : `${Math.floor(mins / 60)}h ${mins % 60}min`;
        }
    }

    window.checkSystemHealth = checkSystemHealth;
    function initSystemStatus() { checkSystemHealth(); setInterval(checkSystemHealth, 30000); }

    /* ──────────────────── LIVE STATS ───────────────────────────── */
    async function updateLiveStats() {
        try {
            const sesObj = getSession();
            if (!sesObj.userId) return;

            const ownerId = sesObj.role === 'Admin' ? sesObj.userId : (sesObj.parentAdminId || sesObj.userId);
            let url = ownerId ? `/api/machines?ownerId=${ownerId}` : '/api/machines';
            url += (url.includes('?') ? '&' : '?') + `requesterRole=${sesObj.role}&technicianId=${sesObj.userId}`;
            const r = await fetchWithT(url, {}, 4000);
            if (!r.ok) return;
            const forks = await r.json();
            const online = forks.filter(f => f.status === 'online').length;
            const offline = forks.length - online;

            const $ = id => document.getElementById(id);
            const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
            set('ns-online', online);
            set('ns-offline', offline);
            set('ns-total', forks.length);

            /* status bar */
            const dot = $('navStatusDot'), txt = $('navStatusText');
            const color = online > 0 ? '#34c759' : '#ffa500';
            const label = online > 0 ? `${online} chariot(s) actif` : 'Aucun chariot actif';
            if (dot) { dot.style.background = color; dot.style.boxShadow = `0 0 10px ${color}`; }
            if (txt) { txt.style.color = color; txt.textContent = label; }

            /* alerts */
            try {
                const nr = await fetchWithT(`/api/notifications?limit=50${ownerId ? `&ownerId=${ownerId}` : ''}&requesterRole=${session.role}`, {}, 3000);
                if (nr.ok) {
                    const notifs = await nr.json();
                    const unreadCount = notifs.filter(n => !n.isRead).length;
                    const latestUnreadType = notifs.find(n => !n.isRead)?.type || 'info';
                    set('ns-alerts', notifs.length);
                    updateBadges(unreadCount);
                    _checkForNewNotifications(unreadCount, latestUnreadType);
                    const onEl = $('syOnline');
                    if (onEl) { onEl.textContent = `${online}/${forks.length}`; onEl.style.color = online > 0 ? '#34c759' : '#ff3b30'; }

                    /* Update Quick Panel HTML dynamically */
                    const notifsReseau = notifs.filter(n => !n.deviceId || ['Global', 'System', '🔐 SECURITE'].includes(n.deviceId));
                    const notifsChariot = notifs.filter(n => n.deviceId && !['Global', 'System', '🔐 SECURITE'].includes(n.deviceId));

                    const buildNotifH = (arr, isChariot) => {
                        if (arr.length === 0) return `<div style="text-align:center;padding:3rem 1rem;color:#555560;"><div style="font-size:3rem;margin-bottom:1rem;opacity:0.3">🔕</div><p style="font-size:0.85rem;">Aucune alerte active</p></div>`;
                        return arr.slice(0, 40).map(n => {
                            let chariotTag = '';
                            if (isChariot) {
                                const machine = searchForklifts.find(m => m.deviceId === n.deviceId);
                                const cName = machine ? `${machine.name} (${machine.model})` : n.deviceId;
                                chariotTag = `<div style="font-size:0.65rem;padding:3px 8px;background:rgba(255,165,0,0.15);color:#ffa500;border-radius:10px;border:1px solid rgba(255,165,0,0.3);margin-left:auto;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;" title="${cName}">${cName}</div>`;
                            }

                            // ── Split message & AI diagnostic ──
                            const rawMsg = n.message || '';
                            const aiSplit = rawMsg.split('\n\n🤖 Diagnostic IA:');
                            const mainMsg = aiSplit[0].trim();
                            const aiDiag = aiSplit[1] ? aiSplit[1].trim() : null;

                            const aiBlock = aiDiag ? `
                                <div style="margin-top:8px;padding:8px 10px;background:rgba(175,82,222,0.1);border:1px solid rgba(175,82,222,0.3);border-radius:8px;border-left:3px solid #af52de;">
                                    <div style="font-size:0.62rem;font-weight:700;color:#af52de;letter-spacing:1px;margin-bottom:4px;">🤖 DIAGNOSTIC IA — GEMINI</div>
                                    <div style="font-size:0.78rem;color:#d8b4fe;line-height:1.5;">${aiDiag}</div>
                                </div>` : '';

                            return `
                            <div class="notif-item ${n.type || 'info'} ${n.isRead ? 'read' : 'unread'}" onclick="intellimettryMarkAsRead('${n._id}')">
                                <div class="notif-icon">${n.type === 'danger' ? '🚨' : n.type === 'warning' ? '⚠️' : 'ℹ️'}</div>
                                <div style="flex:1;min-width:0;">
                                    <div style="display:flex;align-items:center;gap:8px;">
                                        <div class="notif-title">${n.title || 'Alerte'}</div>
                                        ${!n.isRead ? '<div class="unread-dot"></div>' : ''}
                                        ${chariotTag}
                                    </div>
                                    <div class="notif-msg">${mainMsg}</div>
                                    ${aiBlock}
                                    <div class="notif-time">🕐 ${timeAgo(n.timestamp || new Date())}</div>
                                </div>
                            </div>`;
                        }).join('');
                    };

                    const rList = $('qpNotifReseauList');
                    const cList = $('qpNotifChariotList');
                    if (rList) rList.innerHTML = buildNotifH(notifsReseau, false);
                    if (cList) cList.innerHTML = buildNotifH(notifsChariot, true);

                    const rc = $('qpNotifsReseauCount');
                    const cc = $('qpNotifsChariotCount');
                    if (rc) rc.textContent = `${notifsReseau.length} alerte(s)`;
                    if (cc) cc.textContent = `${notifsChariot.length} alerte(s)`;
                }
            } catch (_) { }
        } catch {
            const dot = document.getElementById('navStatusDot');
            const txt = document.getElementById('navStatusText');
            if (dot) { dot.style.background = '#ff3b30'; dot.style.boxShadow = '0 0 10px #ff3b30'; }
            if (txt) { txt.style.color = '#ff3b30'; txt.textContent = 'Backend hors ligne'; }
        }
    }

    function initLiveStats() { updateLiveStats(); setInterval(updateLiveStats, 1000); }

    /* ─────────────────── BADGES ────────────────────────────────── */
    function updateBadges(count) {
        const text = count > 9 ? '9+' : count;
        const display = count > 0 ? 'flex' : 'none';

        const topBadge = document.getElementById('topbarBellBadge');
        if (topBadge) { topBadge.textContent = text; topBadge.style.display = display; }

        const sideBadge = document.getElementById('sidebarNotifBadge');
        if (sideBadge) { sideBadge.textContent = text; sideBadge.style.display = display; }
    }

    /* ─────────────────── SEARCH ────────────────────────────────── */
    const SEARCH_COMMANDS = [
        { icon: '🚜', label: 'Gestion de Flotte', sub: 'Page principale de la flotte', href: 'fleet.html', badge: 'page' },
        //        { icon: '📊', label: 'Dashboard Temps Réel', sub: 'Monitoring live capteurs', href: 'dashboard.html', badge: 'page' },
        { icon: '🔧', label: 'Espace Technicien', sub: 'Pannes et alertes', href: 'technicien.html', badge: 'page' },
        { icon: '👑', label: 'Super Admin', sub: 'Gestion complète', href: 'superadmin.html', badge: 'page' },
        { icon: '➕', label: 'Ajouter un chariot', sub: 'Créer une nouvelle unité', action: 'openAddModal', badge: 'action' },
        { icon: '🔔', label: 'Voir les alertes', sub: 'Panneau des notifications', action: 'openNotifs', badge: 'action' },
        { icon: '📥', label: 'Exporter PDF', sub: 'Télécharger toutes les données', action: 'exportPDF', badge: 'action' },
        { icon: '☀️', label: 'Thème Clair', sub: 'Basculer vers le thème clair', action: 'themeLight', badge: 'action' },
        { icon: '🌙', label: 'Thème Sombre', sub: 'Basculer vers le thème sombre', action: 'themeDark', badge: 'action' },
        { icon: '🚪', label: 'Déconnexion', sub: 'Quitter la session', action: 'logout', badge: 'action' },
    ];

    let searchForklifts = [];

    function initSearch(session, role) {
        /* pre-load forklifts for search */
        const ownerId = session.role === 'Admin' ? session.userId : (session.parentAdminId || session.userId);
        let url = ownerId ? `/api/machines?ownerId=${ownerId}` : '/api/machines';
        url += (url.includes('?') ? '&' : '?') + `requesterRole=${session.role}&technicianId=${session.userId}`;
        fetchWithT(url, {}, 4000)
            .then(r => r.json())
            .then(arr => { searchForklifts = arr; })
            .catch(() => { });

        const input = document.getElementById('intellimettrySearchInput');
        if (input) {
            input.addEventListener('input', () => renderSearch(input.value.trim()));
            input.addEventListener('keydown', handleSearchKeys);
        }
    }

    function renderSearch(query) {
        const res = document.getElementById('intellimettrySearchResults');
        if (!res) return;

        if (!query) { res.innerHTML = '<div class="intellimettry-search-hint">Tapez pour rechercher…</div>'; return; }

        const q = query.toLowerCase();
        const results = [];

        /* Commands */
        SEARCH_COMMANDS.filter(c =>
            c.label.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q)
        ).forEach(c => results.push({ ...c, type: c.badge }));

        /* Forklifts */
        searchForklifts.filter(f =>
            (f.name || '').toLowerCase().includes(q) || (f.deviceId || '').toLowerCase().includes(q) || (f.model || '').toLowerCase().includes(q)
        ).slice(0, 5).forEach(f => results.push({
            icon: f.status === 'online' ? '🟢' : '🔴',
            label: f.name || f.deviceId,
            sub: `${f.model || '—'} · ${f.status === 'online' ? 'En ligne' : 'Hors ligne'}`,
            href: `dashboard.html?device=${f.deviceId}`,
            badge: 'fleet',
            type: 'fleet'
        }));

        if (results.length === 0) {
            res.innerHTML = '<div class="intellimettry-search-hint">Aucun résultat — essayez un autre terme</div>';
            return;
        }

        res.innerHTML = results.map((r, i) => `
            <div class="search-result-item" data-idx="${i}" data-href="${r.href || ''}" data-action="${r.action || ''}"
                 onclick="intellimettrySearchAction('${r.href || ''}','${r.action || ''}')">
                <span class="sri-icon">${r.icon}</span>
                <div>
                    <div class="sri-label">${r.label}</div>
                    <div class="sri-sub">${r.sub}</div>
                </div>
                <span class="sri-badge ${r.badge || ''}">${r.badge || ''}</span>
            </div>`).join('');
    }

    let searchIdx = -1;
    function handleSearchKeys(e) {
        const items = document.querySelectorAll('.search-result-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            searchIdx = (searchIdx + 1) % items.length;
            items.forEach((el, i) => el.classList.toggle('focused', i === searchIdx));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            searchIdx = (searchIdx - 1 + items.length) % items.length;
            items.forEach((el, i) => el.classList.toggle('focused', i === searchIdx));
        } else if (e.key === 'Enter' && searchIdx >= 0) {
            const focused = items[searchIdx];
            if (focused) { intellimettrySearchAction(focused.dataset.href, focused.dataset.action); }
        }
    }

    window.intellimettrySearchAction = function (href, action) {
        intellimettryCloseSearch();
        if (href) { window.location.href = href; return; }
        switch (action) {
            case 'openAddModal': if (typeof openAddModal === 'function') openAddModal(); break;
            case 'openNotifs': intellimettryOpenQuickPanel(getSession().role === 'Super Admin' || getSession().role === 'System Admin' ? 'notifsReseau' : 'notifsChariot'); break;
            case 'exportPDF': if (typeof exportHistory === 'function') exportHistory(); break;
            case 'themeLight': applyTheme('light'); break;
            case 'themeDark': applyTheme('dark'); break;
            case 'logout': intellimettryLogout(); break;
        }
    };

    window.intellimettryOpenSearch = function () {
        document.getElementById('intellimettrySearchModal')?.classList.add('open');
        document.getElementById('intellimettryOverlay')?.classList.add('show');
        const input = document.getElementById('intellimettrySearchInput');
        if (input) { input.value = ''; input.focus(); }
        const res = document.getElementById('intellimettrySearchResults');
        if (res) res.innerHTML = '<div class="intellimettry-search-hint">Tapez pour rechercher…</div>';
        searchIdx = -1;
    };

    window.intellimettryCloseSearch = function () {
        document.getElementById('intellimettrySearchModal')?.classList.remove('open');
        document.getElementById('intellimettryOverlay')?.classList.remove('show');
    };

    /* ─────────────────── QUICK PANEL ───────────────────────────── */
    window.intellimettryOpenQuickPanel = function (tab) {
        document.getElementById('intellimettryQuickPanel')?.classList.add('open');
        document.getElementById('intellimettryOverlay')?.classList.add('show');
        if (tab) switchQpTab(tab);
    };

    window.intellimettryClosePanel = function () {
        document.getElementById('intellimettryQuickPanel')?.classList.remove('open');
        document.getElementById('intellimettrySearchModal')?.classList.remove('open');
        document.getElementById('intellimettryOverlay')?.classList.remove('show');
        document.getElementById('intellimettrySidebar')?.classList.remove('mobile-open');
    };

    window.switchQpTab = function (tab) {
        document.querySelectorAll('.qp-tab').forEach(b => b.classList.toggle('active', b.dataset.panel === tab));
        document.querySelectorAll('.qp-tab-panel').forEach(p => p.classList.toggle('active', p.id === `qp${tab.charAt(0).toUpperCase() + tab.slice(1)}`));
    };

    window.intellimettryClearNotifs = async function (typeGroup) {
        if (!confirm('Voulez-vous vraiment effacer toutes ces notifications ?')) return;
        try {
            const session = getSession();
            const ownerId = session.role === 'Admin' ? session.userId : (session.parentAdminId || session.userId);
            const role = session.role;

            // Appeler le backend pour suppression permanente
            await fetch(`/api/notifications/clear?typeGroup=${typeGroup}&ownerId=${ownerId || ''}&requesterRole=${role}`, { method: 'DELETE' });

            // Optionnel: Tout marquer comme lu avant
            await fetch('/api/notifications/read/all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ownerId, requesterRole: role, typeGroup })
            });

            localStorage.removeItem('notifications');
            updateLiveStats(); // Rafraîchir l'UI immédiatement après
        } catch (e) {
            console.error('Erreur lors du nettoyage des notifications:', e);
        }
    };

    window.intellimettryMarkAsRead = async function (notifId) {
        try {
            await fetch('/api/notifications/read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notifId }) // On passe l'ID individuel
            });
            updateLiveStats(); // Pour mettre à jour le point bleu
        } catch (e) { }
    };

    /* ──────────────────── EXPORT PDF ───────────────────────────── */
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    async function getBase64ImageFromUrl(url) {
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch { return null; }
    }

    window.intellimettryExportPDF = async function () {
        try {
            // Afficher un petit indicateur de chargement
            const input = document.getElementById('intellimettrySearchInput');
            const originalPh = input ? input.placeholder : '';
            if (input) input.placeholder = 'Génération du PDF en cours...';

            // 1. Charger jsPDF et AutoTable
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');

            // 2. Récupérer les données
            const session = getSession();
            const ownerId = session.role === 'Admin' ? session.userId : (session.parentAdminId || session.userId);
            let url = ownerId ? `/api/machines?ownerId=${ownerId}` : '/api/machines';
            url += (url.includes('?') ? '&' : '?') + `requesterRole=${session.role}&technicianId=${session.userId}`;
            const r = await fetchWithT(url, {}, 5000);
            if (!r.ok) throw new Error('Erreur API');
            const forks = await r.json();

            // 3. Préparer le document
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('landscape');
            let currentY = 15;

            // 4. Charger et ajouter le Logo
            const logoBase64 = await getBase64ImageFromUrl('logo.png');
            if (logoBase64) {
                doc.addImage(logoBase64, 'PNG', 14, currentY, 40, 15);
                currentY += 20;
            }

            // 5. En-tête du document
            doc.setFontSize(22);
            doc.setTextColor(0, 114, 170); // Bleu IntelliMettry
            doc.setFont("helvetica", "bold");
            doc.text('IntelliMettry - Rapport de Flotte', 14, currentY);
            currentY += 8;

            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            doc.setFont("helvetica", "normal");
            doc.text(`Généré le: ${new Date().toLocaleString('fr-FR')} | Opérateur: ${session.email || 'Admin'}`, 14, currentY);
            currentY += 12;

            // 6. Tableau des données
            const tableHeaders = [['Nom', 'Modèle', 'ID Terminal', 'Statut', 'Temp (°C)', 'Huile (Bar)', 'Carburant', 'Heures', 'Dernière Maj']];
            const tableData = forks.map(f => [
                f.name || 'N/A',
                f.model || 'N/A',
                f.deviceId || 'N/A',
                f.status === 'online' ? '🟢 En Ligne' : '🔴 Hors Ligne',
                f.telemetry?.temp !== undefined ? `${f.telemetry.temp}°C` : '--',
                f.telemetry?.oil_pressure !== undefined ? `${f.telemetry.oil_pressure} Bar` : '--',
                f.telemetry?.fuel_percent !== undefined ? `${Math.round(f.telemetry.fuel_percent)}%` : '--',
                f.telemetry?.engine_hours !== undefined ? `${Math.round(f.telemetry.engine_hours)}h` : '--',
                f.lastSeen ? new Date(f.lastSeen).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'Jamais'
            ]);

            doc.autoTable({
                head: tableHeaders,
                body: tableData,
                startY: currentY,
                theme: 'striped',
                headStyles: { fillColor: [0, 212, 255], textColor: [0, 0, 0], fontStyle: 'bold' },
                styles: { fontSize: 9, cellPadding: 4, valign: 'middle' },
                alternateRowStyles: { fillColor: [245, 250, 255] },
                margin: { top: 20 },
                didDrawPage: function (data) {
                    // Pied de page
                    doc.setFontSize(8);
                    doc.setTextColor(150, 150, 150);
                    doc.text('© 2026 Inovaria Tech - Système IntelliMettry', data.settings.margin.left, doc.internal.pageSize.height - 10);
                    doc.text(`Page ${doc.internal.getNumberOfPages()}`, doc.internal.pageSize.width - 20, doc.internal.pageSize.height - 10);
                }
            });

            // 7. Sauvegarder
            doc.save(`IntelliMettry_Flotte_${new Date().toISOString().slice(0, 10)}.pdf`);

            if (input) input.placeholder = originalPh;
        } catch (e) {
            alert('Erreur export PDF : ' + e.message);
        }
    };

    /* ──────────────────── LOGOUT ───────────────────────────────── */
    window.intellimettryLogout = function () {
        if (confirm('Déconnecter ?')) {
            localStorage.removeItem('admin-session');
            window.location.href = 'login.html';
        }
    };

    /* ──────────────────── BOOT ─────────────────────────────────── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
