// fleet.js - Gestion de la flotte de chariots elevateurs
const API = '';  // Meme serveur (chemin relatif)
// =============================================
// === AUTH ===
// =============================================
// Verifier l'authentification
function checkAuth() {
    const session = localStorage.getItem('admin-session');
    if (!session) { window.location.href = 'login.html'; return false; }
    const data = JSON.parse(session);
    if (!data.loggedIn) { window.location.href = 'login.html'; return false; }
    const elName = document.getElementById('userName');
    if (elName) elName.textContent = data.email.split('@')[0];
    const elRole = document.querySelector('.user-role');
    if (elRole) elRole.textContent = data.role;
    // Adapter l'UI selon le rôle
    adaptUI(data.role);
    // FILTRE DE REDIRECTION STRICT
    if (data.role === 'Technicien' || data.role === 'Lecture seule') {
        window.location.href = 'technicien.html';
        return false;
    }
    return true;
}
function adaptUI(role) {
    const btnAdd = document.getElementById('btnAddMachine');
    const btnManage = document.getElementById('btnManageUsers');
    
    // Default: hide everything
    if (btnAdd) btnAdd.style.display = 'none';
    if (btnManage) btnManage.style.display = 'none';

    if (role === 'System Admin') {
        if (btnManage) {
            btnManage.style.display = 'inline-flex';
            btnManage.innerHTML = '👥 Gestion Système';
            btnManage.onclick = () => openAdminModal();
        }
    } else if (role === 'Super Admin') {
        if (btnManage) {
            btnManage.style.display = 'inline-flex';
            btnManage.innerHTML = '👤 Nouvel Utilisateur';
            btnManage.onclick = () => openAdminModal();
        }
    }
}
function logout() {
    if (confirm('Voulez-vous vraiment vous deconnecter ?')) {
        localStorage.removeItem('admin-session');
        window.location.href = 'login.html';
    }
}
// =============================================
// === MACHINES (API Backend) ===
// =============================================
// Obtenir l'ID du proprietaire pour isolation (Admin courant)
function getCurrentOwnerId() {
    const session = localStorage.getItem('admin-session');
    if (!session) return null;
    const data = JSON.parse(session);
    // System Admin → 'ALL' (pas de filtre, voit tout)
    if (data.role === 'System Admin') return 'ALL';
    // Super Admin → son vrai userId : le backend fetche ensuite ses machines + celles de ses sous-admins
    if (data.role === 'Super Admin') return data.userId || data.id;
    // Admin → son propre ID. Technicien → utilise parentAdminId pour les notifs/personnel
    return (data.role === 'Admin') ? data.userId : (data.parentAdminId || data.userId);
}
function getRequesterRole() {
    const session = localStorage.getItem('admin-session');
    if (!session) return '';
    return JSON.parse(session).role || '';
}
async function getForklifts() {
    try {
        const ownerId = getCurrentOwnerId();
        const role = getRequesterRole();
        let url = `${API}/api/machines?requesterRole=${role}&includeTelemetry=true`;
        if (ownerId !== 'ALL') url += `&ownerId=${ownerId}`;
        const session = JSON.parse(localStorage.getItem('admin-session'));
        if (role === 'Technicien' && session) url += `&technicianId=${session.userId || session.id}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (res.ok) return await res.json();
    } catch (e) { }
    // Fallback localStorage
    const d = localStorage.getItem('forklifts');
    return d ? JSON.parse(d) : [];
}
async function addMachine(data) {
    // If ownerId is provided in data (from Super Admin dropdown), use it. Otherwise use current user ID.
    const ownerId = data.ownerId || getCurrentOwnerId();
    const payload = { ...data, ownerId };
    const res = await fetch(`${API}/api/machines`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erreur serveur');
    return json;
}
async function deleteMachineAPI(deviceId) {
    const res = await fetch(`${API}/api/machines/${deviceId}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Erreur suppression'); }
    return true;
}
// =============================================
// === CALIBRATION ===
// =============================================
const MODEL_CALIBRATION_DEFAULTS = {
    'ISUZU V1': { beta: 3950, r0: '3025 Omega', fuelEmpty: '12 Omega', fuelFull: '166 Omega', tank: '52 L' },
    'ISUZU V2': { beta: 3950, r0: '3025 Omega', fuelEmpty: '12 Omega', fuelFull: '166 Omega', tank: '52 L' },
    'ISUZU V3': { beta: 3950, r0: '3025 Omega', fuelEmpty: '12 Omega', fuelFull: '166 Omega', tank: '52 L' },
    'ISUZU V4': { beta: 3950, r0: '3025 Omega', fuelEmpty: '12 Omega', fuelFull: '166 Omega', tank: '52 L' },
    'Chinois Type A': { beta: 3950, r0: '3025 Omega', fuelEmpty: '12 Omega', fuelFull: '166 Omega', tank: '52 L' },
    'Chinois Type B': { beta: 3950, r0: '3025 Omega', fuelEmpty: '12 Omega', fuelFull: '166 Omega', tank: '52 L' }
};
function onModelChange(model) {
    const info = document.getElementById('calibrationInfo');
    const cal = MODEL_CALIBRATION_DEFAULTS[model];
    if (!cal) { info.style.display = 'none'; return; }
    document.getElementById('calBeta').textContent = cal.beta;
    document.getElementById('calR0').textContent = cal.r0;
    document.getElementById('calFuelEmpty').textContent = cal.fuelEmpty;
    document.getElementById('calFuelFull').textContent = cal.fuelFull;
    document.getElementById('calTank').textContent = cal.tank;
    info.style.display = 'block';
}
// =============================================
// === HELPERS ===
// =============================================
function getTimeAgo(date) {
    const s = Math.floor((new Date() - new Date(date)) / 1000);
    if (s < 60) return `Il y a ${s}s`;
    if (s < 3600) return `Il y a ${Math.floor(s / 60)}min`;
    if (s < 86400) return `Il y a ${Math.floor(s / 3600)}h`;
    return `Il y a ${Math.floor(s / 86400)}j`;
}
// =============================================
// === DISPLAY ===
// =============================================
async function updateStats() {
    const ownerId = getCurrentOwnerId();
    const [forklifts, bracelets] = await Promise.all([
        getForklifts(),
        fetch(`${API}/api/bracelets?ownerId=${ownerId}`).then(r => r.json())
    ]);

    document.getElementById('totalCount').textContent = forklifts.length;
    document.getElementById('onlineCount').textContent = forklifts.filter(f => f.status === 'online').length;
    document.getElementById('offlineCount').textContent = forklifts.filter(f => f.status === 'offline').length;
    
    // Machine Alerts
    document.getElementById('alertCount').textContent = forklifts.filter(f => {
        if (f.status === 'offline') return false;
        return f.health?.temp === 'warning' || f.health?.temp === 'danger' ||
            f.health?.oil === 'warning' || f.health?.oil === 'danger' ||
            (f.health?.fuel || 0) < 20;
    }).length;

    // Bracelet Stats
    const now = new Date();
    const activeBracelets = bracelets.filter(b => (now - new Date(b.lastSeen)) < 300000); // Active in last 5min
    const healthAlerts = bracelets.filter(b => b.heartRate > 100 || b.heartRate < 50);

    document.getElementById('activeBraceletsCount').textContent = activeBracelets.length;
    document.getElementById('healthAlertsCount').textContent = healthAlerts.length;
}
function createForkliftCard(f) {
    const card = document.createElement('div');
    card.className = 'forklift-card';
    card.dataset.id = f.deviceId || f._id;
    // -- Dynamic Health Rendering (Values & Status) --
    const health = f.health || {};
    const tel = f.telemetry || {};
    // 🌡️ TEMPERATURE
    let tempDisplay = 'NC';
    if (tel.temp_nc) {
        tempDisplay = '<span style="color:var(--danger);font-weight:700;font-size:0.75rem;">Problème Capteur</span>';
    } else if (tel.temp !== undefined && tel.temp !== null) {
        let val = `<span style="font-weight:700">${Number(tel.temp).toFixed(1)}°C</span>`;
        tempDisplay = (health.temp === 'danger') ? `<span style="color:var(--danger)">${val}</span>` :
            (health.temp === 'warning') ? `<span style="color:var(--warning)">${val}</span>` : val;
    }
    // 🛢️ OIL PRESSURE
    let oilDisplay = 'NC';
    if (tel.oil_nc) {
        oilDisplay = '<span style="color:var(--danger);font-weight:700;font-size:0.75rem;">Problème Capteur</span>';
    } else if (tel.oil_pressure !== undefined && tel.oil_pressure !== null) {
        let val = `<span style="font-weight:700">${Number(tel.oil_pressure).toFixed(1)} Bar</span>`;
        oilDisplay = (health.oil === 'danger') ? `<span style="color:var(--danger)">${val}</span>` :
            (health.oil === 'warning') ? `<span style="color:var(--warning)">${val}</span>` : val;
    }
    // ⛽ FUEL
    let fuelDisplay = 'NC';
    const fuelPct = tel.fuel_percent ?? health.fuel ?? 0;
    if (tel.fuel_nc) {
        fuelDisplay = '<span style="color:var(--danger);font-weight:700;font-size:0.75rem;">Problème Capteur</span>';
    } else if (fuelPct < 5) {
        fuelDisplay = '<span style="color:var(--danger);font-weight:700">Vide</span>';
    } else if (fuelPct > 5) {
        const liters = Math.round((fuelPct / 100) * 52);
        fuelDisplay = `<span style="font-weight:700">${liters}L</span><br><span style="font-size:.7rem;opacity:.8">${Math.round(fuelPct)}%</span>`;
    }
    const deviceLabel = f.deviceId || f._id;
    // Extraire l'ownerId de la machine pour filtrer les techniciens dans le modal
    const cardOwnerId = (f.ownerId && f.ownerId._id) ? f.ownerId._id : (f.ownerId ? String(f.ownerId) : '');
    card.innerHTML = `
        <div class="forklift-header">
            <div>
                <div class="forklift-name">${f.name}</div>
                <div class="forklift-model">${f.model}</div>
            </div>
            <div class="status-badge ${f.status}">
                <div class="status-dot"></div>
                ${f.status === 'online' ? 'EN LIGNE' : 'HORS LIGNE'}
            </div>
        </div>
        <div class="forklift-stats">
            <div class="stat-item"><div class="stat-value-small">${tempDisplay}</div><div class="stat-label-small">Temp</div></div>
            <div class="stat-item"><div class="stat-value-small">${oilDisplay}</div><div class="stat-label-small">Huile</div></div>
            <div class="stat-item"><div class="stat-value-small">${fuelDisplay}</div><div class="stat-label-small">Carburant</div></div>
        </div>
        <div class="last-seen" style="display:flex;justify-content:space-between;align-items:center;">
            <span> ${getTimeAgo(f.lastSeen)}</span>
            <span style="font-size:.7rem;color:var(--text-secondary);font-family:monospace;"> ${deviceLabel}</span>
        </div>
        <div class="forklift-actions">
            <button class="btn-view" onclick="viewDashboard('${f.deviceId}')"> Voir Dashboard</button>
            <button class="btn-techs" onclick="openAssignTechsToMachineModal('${f.deviceId}', '${f.name}', '${cardOwnerId}')" title="Techniciens">👥 Techniciens</button>
            ${f.status !== 'online' ? `<button class="btn-delete" onclick="deleteForklift('${f.deviceId}', event)" title="Supprimer">🗑️</button>` : ''}
        </div>`;
    return card;
}
async function displayForklifts(forkliftsToDisplay = null) {
    const forklifts = forkliftsToDisplay || await getForklifts();
    const grid = document.getElementById('forkliftGrid');
    if (!grid) return;
    grid.innerHTML = '';
    if (!forklifts.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-secondary)"><div style="font-size:4rem;margin-bottom:1rem"></div><h2>Aucun chariot dans la flotte</h2></div>`;
        return;
    }
    forklifts.forEach(f => grid.appendChild(createForkliftCard(f)));
}
async function filterForklifts() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const all = await getForklifts();
    const filtered = all.filter(f =>
        (f.name || '').toLowerCase().includes(term) ||
        (f.model || '').toLowerCase().includes(term) ||
        (f.deviceId || '').toLowerCase().includes(term) ||
        (f.description || '').toLowerCase().includes(term)
    );
    displayForklifts(filtered);
}
// =============================================
// === MODAL CHARIOT ===
// =============================================
function openAddModal() { document.getElementById('addModal').classList.add('show'); }
function closeAddModal() {
    document.getElementById('addModal').classList.remove('show');
    document.getElementById('addForkliftForm').reset();
    const info = document.getElementById('calibrationInfo');
    if (info) info.style.display = 'none';
}
document.addEventListener('DOMContentLoaded', () => {
    initOwnerDropdown();
    if (document.getElementById('addForkliftForm')) {
        document.getElementById('addForkliftForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('[type=submit]');
            btn.disabled = true; btn.textContent = ' Ajout...';
            try {
                await addMachine({
                    ownerId: document.getElementById('forkliftOwner')?.value || getCurrentOwnerId(),
                    deviceId: document.getElementById('forkliftDeviceId').value.trim(),
                    name: document.getElementById('forkliftName').value,
                    model: document.getElementById('forkliftModel').value,
                    serial: document.getElementById('forkliftSerial').value || '',
                    description: document.getElementById('forkliftDescription').value || ''
                });
                closeAddModal();
                await displayForklifts();
                await updateStats();
            } catch (err) {
                alert(' ' + err.message);
            } finally {
                btn.disabled = false; btn.textContent = 'Ajouter';
            }
        });
    }
    document.getElementById('addModal')?.addEventListener('click', e => {
        if (e.target.id === 'addModal') closeAddModal();
    });

    // --- AUTO-REFRESH (Every 10 seconds) ---
    setInterval(async () => {
        // Refresh Machines & Notifications
        await updateStats();
        await displayNotifications();

        // Refresh Personnel only if visible
        const personnelSection = document.getElementById('personnelSection');
        if (personnelSection && personnelSection.style.display !== 'none') {
            await displayPersonnel();
        }
    }, 10000);
});
async function deleteForklift(deviceId, event) {
    event.stopPropagation();
    if (!confirm('Supprimer ce chariot ?')) return;
    try {
        await deleteMachineAPI(deviceId);
        await displayForklifts();
        await updateStats();
    } catch (err) {
        alert(' ' + err.message);
    }
}
// viewDashboard() est défini dans fleet.html (modal inline)
// function viewDashboard(id) { window.location.href = `dashboard.html?id=${id}`; }

// =============================================
// === ADMINS (API Backend) ===
// =============================================
async function getAdmins() {
    try {
        const res = await fetch(`${API}/api/users`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) return await res.json();
    } catch (e) { }
    return [];
}
// =============================================
// === MODAL ADMIN ===
// =============================================
// ⚠️ Le handler complet (avec parentAdminId + assignedMachines) est géré
//    plus bas dans la section GESTION TECHNICIENS & ASSIGNATION.
// =============================================
// === NOTIFICATIONS (API Backend) ===
// =============================================
const BACKEND_URL = '';
async function fetchNotificationsFromAPI() {
    const forklifts = await getForklifts();
    const role = getRequesterRole();
    const ownerId = getCurrentOwnerId();
    try {
        let url = `${BACKEND_URL}/api/notifications?limit=30&requesterRole=${role}`;
        if (ownerId !== 'ALL') url += `&ownerId=${ownerId}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            const apiNotifs = await res.json();
            return apiNotifs.map(n => {
                const f = forklifts.find(f => f.deviceId === n.deviceId);
                return {
                    id: n._id, type: n.type || 'info',
                    title: n.title, message: n.message,
                    forklift: f ? `${f.name} (${f.model})` : n.deviceId,
                    time: getTimeAgo(n.timestamp), timestamp: n.timestamp
                };
            });
        }
    } catch (err) { console.warn('[Notifications] Fallback:', err.message); }
    const notifications = [];
    forklifts.forEach(f => {
        const label = `${f.name} (${f.model})`;
        if (f.status === 'offline') notifications.push({ id: `no-${f.deviceId}`, type: 'danger', title: 'Chariot Hors Ligne', message: `Hors ligne depuis ${getTimeAgo(f.lastSeen)}`, forklift: label, time: getTimeAgo(f.lastSeen), timestamp: f.lastSeen });
        if (f.health?.temp === 'danger') notifications.push({ id: `td-${f.deviceId}`, type: 'danger', title: ' Surchauffe', message: 'Temperature critique', forklift: label, time: 'Maintenant', timestamp: new Date().toISOString() });
        else if (f.health?.temp === 'warning') notifications.push({ id: `tw-${f.deviceId}`, type: 'warning', title: ' Temperature Elevee', message: 'Au-dessus de la normale', forklift: label, time: 'Il y a 5min', timestamp: new Date(Date.now() - 300000).toISOString() });
        if (f.health?.oil === 'danger') notifications.push({ id: `od-${f.deviceId}`, type: 'danger', title: ' Pression Huile Critique', message: 'Niveau dangereux', forklift: label, time: 'Maintenant', timestamp: new Date().toISOString() });
        if ((f.health?.fuel || 0) < 10) notifications.push({ id: `fd-${f.deviceId}`, type: 'danger', title: ' Carburant Critique', message: `Niveau: ${f.health?.fuel}%`, forklift: label, time: 'Maintenant', timestamp: new Date().toISOString() });
        else if ((f.health?.fuel || 0) < 20) notifications.push({ id: `fw-${f.deviceId}`, type: 'warning', title: ' Carburant Faible', message: `Niveau: ${f.health?.fuel}%`, forklift: label, time: 'Il y a 10min', timestamp: new Date(Date.now() - 600000).toISOString() });
    });
    return notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}
async function displayNotifications() {
    const list = document.getElementById('notificationList');
    const badge = document.getElementById('notificationBadge');
    if (!list) return;
    list.innerHTML = `<div style="text-align:center;padding:1rem;color:var(--text-secondary)"> Chargement...</div>`;
    const notifications = await fetchNotificationsFromAPI();
    if (notifications.length > 0) {
        if (badge) { badge.textContent = notifications.length; badge.style.display = 'flex'; }
    } else {
        if (badge) { badge.style.display = 'none'; }
    }
    if (!notifications.length) {
        list.innerHTML = `<div class="notification-empty"><div class="notification-empty-icon"></div><p>Aucune notification</p></div>`;
        return;
    }
    list.innerHTML = notifications.map(n => `
        <div class="notification-item ${n.type}">
            <div class="notification-item-header"><div class="notification-item-title">${n.title}</div><div class="notification-item-time">${n.time}</div></div>
            <div class="notification-item-message">${n.message}</div>
            <div class="notification-item-forklift"> ${n.forklift}</div>
        </div>`).join('');
}
function toggleNotificationPanel() {
    const panel = document.getElementById('notificationPanel');
    const overlay = document.getElementById('notificationOverlay');
    if (panel.classList.contains('open')) { closeNotificationPanel(); }
    else { panel.classList.add('open'); overlay.classList.add('show'); displayNotifications(); }
}
function closeNotificationPanel() {
    document.getElementById('notificationPanel')?.classList.remove('open');
    document.getElementById('notificationOverlay')?.classList.remove('show');
}
// =============================================
// === PERSONNEL & BRACELETS ===
// =============================================
function togglePersonnelSection() {
    const section = document.getElementById('personnelSection');
    const grid = document.getElementById('forkliftGrid');
    if (section.style.display === 'none') {
        section.style.display = 'block';
        grid.style.display = 'none';
        displayPersonnel();
    } else {
        section.style.display = 'none';
        grid.style.display = 'grid';
    }
}
async function displayPersonnel() {
    const ownerId = getCurrentOwnerId();
    const [workers, bracelets] = await Promise.all([
        fetch(`${API}/api/workers?ownerId=${ownerId}`).then(r => r.json()),
        fetch(`${API}/api/bracelets?ownerId=${ownerId}`).then(r => r.json())
    ]);
    const wGrid = document.getElementById('workerGrid');
    const bGrid = document.getElementById('braceletGrid');
    wGrid.innerHTML = workers.map(w => {
        const b    = w.braceletId;
        const hr   = b ? (b.heartRate   > 0 ? b.heartRate   : '--') : '--';
        const spo2 = b ? (b.spo2        > 0 ? b.spo2        : '--') : '--';
        const temp = b ? (b.temperature > 0 ? b.temperature : '--') : '--';
        const batt = b ? (b.battery || 0)                           : null;

        const hrColor   = (typeof hr   === 'number' && (hr > 100 || hr < 50))  ? 'var(--danger)'  : '#10b981';
        const spo2Color = (typeof spo2 === 'number' && spo2 < 94)              ? 'var(--danger)'  : '#8b5cf6';
        const tempColor = (typeof temp === 'number' && temp > 38.0)            ? 'var(--danger)'  : '#f97316';
        const isOnline  = b && (Date.now() - new Date(b.lastSeen).getTime() < 60000);

        // Initiale du nom
        const initiale = (w.name || '?').charAt(0).toUpperCase();

        // Barre batterie colorée
        const battColor = batt < 20 ? 'var(--danger)' : batt < 50 ? 'var(--warning)' : '#10b981';
        const battBar   = batt !== null ? `
            <div style="background:rgba(255,255,255,0.08); border-radius:999px; height:5px; margin-top:4px; overflow:hidden; width:70px; display:inline-block;">
                <div style="width:${batt}%; height:100%; background:${battColor}; border-radius:999px; transition:width 0.5s;"></div>
            </div>` : '';

        return `
            <div class="forklift-card" style="cursor:default; position:relative; overflow:hidden;">
                <!-- Top glow line based on status -->
                <div style="position:absolute; top:0; left:0; width:100%; height:3px; background:${isOnline ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#ef4444,#f87171)'}; opacity:0.8;"></div>

                <!-- Header -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start; padding-top:4px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <!-- Avatar -->
                        <div style="width:42px; height:42px; border-radius:50%; background:linear-gradient(135deg,#0066ff,#7f5af0); display:flex; align-items:center; justify-content:center; font-size:1.1rem; font-weight:800; color:white; flex-shrink:0;">
                            ${initiale}
                        </div>
                        <div>
                            <div class="forklift-name" style="font-size:1rem;">${w.name}</div>
                            <div class="forklift-model" style="font-size:0.78rem; margin-top:1px;">${w.role}</div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span class="brac-card-conn ${isOnline ? 'online' : 'offline'}">
                            <span class="brac-card-conn-dot"></span>
                            ${isOnline ? 'EN LIGNE' : 'HORS LIGNE'}
                        </span>
                        <button class="btn-delete" onclick="deleteWorker('${w._id}')" style="padding:4px 8px; font-size:0.85rem;">🗑️</button>
                    </div>
                </div>

                <!-- Batterie -->
                ${b ? `
                <div style="margin-top:10px; display:flex; align-items:center; gap:8px; font-size:0.72rem; color:rgba(255,255,255,0.45);">
                    <span>🔋 ${batt}%</span>
                    ${battBar}
                    <span style="margin-left:auto; font-size:0.68rem; font-family:monospace; color:rgba(255,255,255,0.3);">${b.deviceId}</span>
                </div>` : ''}

                <!-- Vitaux -->
                <div style="margin-top:10px; padding:12px; background:rgba(255,255,255,0.04); border-radius:12px; border:1px solid rgba(255,255,255,0.07); position:relative; overflow:hidden;">
                    <!-- Heartbeat animation (only when online & has HR) -->
                    ${isOnline && typeof hr === 'number' && hr > 40 ? `
                        <div style="position:absolute; bottom:0; left:0; width:100%; height:28px; opacity:0.12; pointer-events:none;">
                            <svg viewBox="0 0 100 28" preserveAspectRatio="none" style="width:100%; height:100%">
                                <path d="M0 14 L18 14 L23 4 L28 24 L33 14 L50 14 L55 4 L60 24 L65 14 L82 14 L87 4 L92 24 L97 14 L100 14"
                                      fill="none" stroke="#10b981" stroke-width="2">
                                    <animate attributeName="stroke-dasharray" from="0,200" to="200,0" dur="${Math.max(0.4, 60/hr)}s" repeatCount="indefinite"/>
                                </path>
                            </svg>
                        </div>` : ''}

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-size:0.68rem; font-weight:700; color:rgba(255,255,255,0.35); letter-spacing:1px; text-transform:uppercase;">Santé Live</span>
                        ${!b ? '<span style="font-size:0.72rem; color:var(--warning);">⚠ Aucun bracelet</span>' : ''}
                    </div>

                    ${b ? `
                    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px; text-align:center;">
                        <div>
                            <div style="font-size:1.4rem; font-weight:800; color:${hrColor}; line-height:1.1;">${hr}</div>
                            <div style="font-size:0.6rem; opacity:0.5; margin-top:2px;">❤️ BPM</div>
                        </div>
                        <div style="border-left:1px solid rgba(255,255,255,0.07); border-right:1px solid rgba(255,255,255,0.07);">
                            <div style="font-size:1.4rem; font-weight:800; color:${spo2Color}; line-height:1.1;">${typeof spo2 === 'number' ? spo2 + '%' : spo2}</div>
                            <div style="font-size:0.6rem; opacity:0.5; margin-top:2px;">🩸 SpO₂</div>
                        </div>
                        <div>
                            <div style="font-size:1.4rem; font-weight:800; color:${tempColor}; line-height:1.1;">${typeof temp === 'number' ? temp + '°C' : temp}</div>
                            <div style="font-size:0.6rem; opacity:0.5; margin-top:2px;">🌡️ Temp</div>
                        </div>
                    </div>` : `
                    <div style="text-align:center; padding:8px; color:rgba(255,255,255,0.25); font-size:0.82rem;">-- -- --</div>`}
                </div>

                <!-- Action Buttons -->
                <div style="display:flex; gap:8px; margin-top:10px;">
                    ${b ? `
                    <button onclick="openWorkerDetail('${w.name.replace(/'/g,"\\'")}', '${w.role}', '${b.deviceId}')"
                        style="flex:2; padding:0.55rem; border:none; border-radius:10px;
                               background:linear-gradient(135deg,rgba(0,102,255,0.18),rgba(127,90,240,0.18));
                               border:1px solid rgba(0,212,255,0.2); color:#00d4ff;
                               font-weight:700; cursor:pointer; font-size:0.82rem; transition:all 0.2s;"
                        onmouseover="this.style.background='linear-gradient(135deg,#0066ff,#7f5af0)'; this.style.color='white'; this.style.borderColor='transparent';"
                        onmouseout="this.style.background='linear-gradient(135deg,rgba(0,102,255,0.18),rgba(127,90,240,0.18))'; this.style.color='#00d4ff'; this.style.borderColor='rgba(0,212,255,0.2)';">
                        📊 Historique & Détails
                    </button>` : ''}
                    <button onclick="openAssignModal('${w._id}')"
                        style="flex:1; padding:0.55rem; border:1px solid rgba(255,255,255,0.12); border-radius:10px;
                               background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.6);
                               font-weight:600; cursor:pointer; font-size:0.8rem; transition:all 0.2s;"
                        onmouseover="this.style.background='rgba(255,255,255,0.1)'; this.style.color='white';"
                        onmouseout="this.style.background='rgba(255,255,255,0.04)'; this.style.color='rgba(255,255,255,0.6)';">
                        ${b ? '🔄 Bracelet' : '⌚ Attribuer'}
                    </button>
                </div>
            </div>
        `;
    }).join('') || '<p style="text-align:center; color:var(--text-dim); padding:2rem;">Aucun travailleur</p>';

    bGrid.innerHTML = bracelets.map(b => {
        const hr   = b.heartRate   > 0 ? b.heartRate   : '--';
        const spo2 = b.spo2        > 0 ? b.spo2        : '--';
        const temp = b.temperature > 0 ? b.temperature : '--';
        const hrColor   = (typeof hr   === 'number' && (hr > 100 || hr < 50))  ? 'var(--danger)' : 'var(--primary)';
        const spo2Color = (typeof spo2 === 'number' && spo2 < 94)              ? 'var(--danger)' : '#8b5cf6';
        const tempColor = (typeof temp === 'number' && temp > 38.0)            ? 'var(--danger)' : '#f97316';

        // Statut connexion : online ET actif dans la dernière minute
        const isOnline = b.status === 'online' && (Date.now() - new Date(b.lastSeen).getTime() < 60000);
        const connClass = isOnline ? 'online' : 'offline';
        const connLabel = isOnline ? '● EN LIGNE' : '● HORS LIGNE';

        return `
            <div class="forklift-card" style="cursor:default">
                <div style="display:flex; justify-content:space-between; align-items:flex-start">
                    <div>
                        <div class="forklift-name">${b.deviceId}</div>
                        <div class="brac-card-conn ${connClass}">
                            <span class="brac-card-conn-dot"></span>
                            ${connLabel}
                        </div>
                        <div class="forklift-model" style="margin-top:4px">🔋 ${b.battery}% &nbsp;·&nbsp; Màj: ${getTimeAgo(b.lastSeen)}</div>
                    </div>
                    <button class="btn-delete" onclick="deleteBracelet('${b.deviceId}')">🗑️</button>
                </div>
                <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:1rem; padding:0.75rem; background:rgba(255,255,255,0.04); border-radius:12px; border:1px solid rgba(255,255,255,0.07)">
                    <div style="text-align:center">
                        <div style="font-size:1.3rem; font-weight:800; color:${hrColor}">${hr}${typeof hr === 'number' ? '' : ''}</div>
                        <div style="font-size:0.62rem; opacity:0.55; margin-top:2px">❤️ BPM</div>
                    </div>
                    <div style="text-align:center; border-left:1px solid rgba(255,255,255,0.08); border-right:1px solid rgba(255,255,255,0.08)">
                        <div style="font-size:1.3rem; font-weight:800; color:${spo2Color}">${spo2}${typeof spo2 === 'number' ? '%' : ''}</div>
                        <div style="font-size:0.62rem; opacity:0.55; margin-top:2px">🩸 SpO₂</div>
                    </div>
                    <div style="text-align:center">
                        <div style="font-size:1.3rem; font-weight:800; color:${tempColor}">${temp}${typeof temp === 'number' ? '°C' : ''}</div>
                        <div style="font-size:0.62rem; opacity:0.55; margin-top:2px">🌡️ Temp</div>
                    </div>
                </div>
                <button onclick="openBraceletDetail('${b.deviceId}')"
                    style="width:100%; margin-top:0.75rem; padding:0.6rem; border:none; border-radius:10px;
                           background:linear-gradient(135deg,#0066ff22,#7f5af022); border:1px solid rgba(0,212,255,0.2);
                           color:#00d4ff; font-weight:700; cursor:pointer; font-size:0.88rem; transition:all 0.2s;"
                    onmouseover="this.style.background='linear-gradient(135deg,#0066ff,#7f5af0)'; this.style.color='white';"
                    onmouseout="this.style.background='linear-gradient(135deg,#0066ff22,#7f5af022)'; this.style.color='#00d4ff';">
                    📊 Voir Historique & Détails
                </button>
            </div>
        `;
    }).join('') || '<p style="text-align:center; color:var(--text-dim)">Aucun bracelet</p>';

}
function openAddWorkerModal() { document.getElementById('workerModal').classList.add('show'); }
function closeWorkerModal() { document.getElementById('workerModal').classList.remove('show'); }
function openAddBraceletModal() { document.getElementById('braceletModal').classList.add('show'); }
function closeBraceletModal() { document.getElementById('braceletModal').classList.remove('show'); }
function openAssignModal(workerId) {
    const braceletId = prompt("Entrez le Device ID du bracelet à assigner (laissez vide pour désassigner) :");
    if (braceletId !== null) { // Sauf si l'utilisateur annule
        assignBracelet(workerId, braceletId.trim());
    }
}
async function assignBracelet(workerId, braceletDeviceId) {
    const ownerId = getCurrentOwnerId();
    let targetBraceletId = null;

    if (braceletDeviceId) {
        const resB = await fetch(`${API}/api/bracelets?ownerId=${ownerId}`);
        const bracelets = await resB.json();
        const bracelet = bracelets.find(b => b.deviceId === braceletDeviceId);
        if (!bracelet) { alert("Bracelet non trouvé. Vérifiez le Device ID."); return; }
        targetBraceletId = bracelet._id;
    }

    try {
        const res = await fetch(`${API}/api/bracelets/assign`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workerId, braceletId: targetBraceletId })
        });
        if (!res.ok) throw new Error("Erreur serveur");
        displayPersonnel();
    } catch (err) {
        alert("Erreur lors de l'assignation : " + err.message);
    }
}
function deleteWorker(id) {
    if (confirm('Supprimer ce travailleur ?')) {
        fetch(`${API}/api/workers/${id}`, { method: 'DELETE' }).then(() => displayPersonnel());
    }
}
function deleteBracelet(deviceId) {
    if (confirm('Supprimer ce bracelet ?')) {
        fetch(`${API}/api/bracelets/${deviceId}`, { method: 'DELETE' }).then(() => displayPersonnel());
    }
}
// =============================================
// === INIT ===
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    const workerForm = document.getElementById('addWorkerForm');
    if (workerForm) {
        workerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('[type=submit]');
            btn.disabled = true;
            try {
                const ownerId = getCurrentOwnerId();
                const res = await fetch(`${API}/api/workers`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ownerId, name: document.getElementById('workerName').value, role: document.getElementById('workerRole').value })
                });
                if (!res.ok) throw new Error(await res.text());
                closeWorkerModal();
                displayPersonnel();
                alert("Travailleur ajouté avec succès !");
            } catch (err) {
                alert("Erreur ajout travailleur: " + err.message);
            } finally {
                btn.disabled = false;
            }
        });
    }
    const braceletForm = document.getElementById('addBraceletForm');
    if (braceletForm) {
        braceletForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('[type=submit]');
            btn.disabled = true;
            try {
                const ownerId = getCurrentOwnerId();
                const res = await fetch(`${API}/api/bracelets`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ownerId, deviceId: document.getElementById('braceletDeviceId').value })
                });
                if (!res.ok) throw new Error(await res.text());
                closeBraceletModal();
                displayPersonnel();
                alert("Bracelet enregistré avec succès !");
            } catch (err) {
                alert("Erreur enregistrement bracelet: " + err.message);
            } finally {
                btn.disabled = false;
            }
        });
    }
});
async function initOwnerDropdown() {
    const session = JSON.parse(localStorage.getItem('admin-session') || '{}');
    const isSuperAdmin = session.role === 'Super Admin' || session.role === 'System Admin';
    const ownerSection = document.getElementById('ownerSection');
    const ownerSelect = document.getElementById('forkliftOwner');
    if (isSuperAdmin && ownerSection && ownerSelect) {
        ownerSection.style.display = 'block';
        try {
            // Fetch sub-admins for this Super Admin
            const parentId = session.userId || session.id;
            const res = await fetch(`${API}/api/users?parentAdminId=${parentId}&requesterRole=${session.role}`);
            if (res.ok) {
                const users = await res.json();
                const admins = users.filter(u => u.role === 'Admin');
                let options = `<option value="${parentId}">Moi (Propriétaire direct)</option>`;
                options += admins.map(a => `<option value="${a._id}">${a.email.split('@')[0]} (Admin)</option>`).join('');
                ownerSelect.innerHTML = options;
            }
        } catch (err) {
            console.error('Erreur chargement admins:', err);
        }
    }
}
window.addEventListener('DOMContentLoaded', async () => {
    if (checkAuth()) {
        await initOwnerDropdown();
        await displayForklifts();
        await updateStats();
        displayNotifications();
        setInterval(async () => {
            const section = document.getElementById('personnelSection');
            if (section && section.style.display === 'none') {
                await displayForklifts();
                await updateStats();
                displayNotifications();
            } else if (section) {
                displayPersonnel();
            }
        }, 30000);
    }
});
// =============================================
// === GESTION TECHNICIENS & ASSIGNATION ===
// =============================================
function openAdminModal() {
    document.getElementById('adminModal').classList.add('show');
    toggleCreateUserMachines(); // Reset machine list
}
function closeAdminModal() {
    document.getElementById('adminModal').classList.remove('show');
    document.getElementById('addAdminForm').reset();
    document.getElementById('userMachinesSection').style.display = 'none';
    document.getElementById('adminError').style.display = 'none';
}
async function toggleCreateUserMachines() {
    const role = document.getElementById('adminRole').value;
    const section = document.getElementById('userMachinesSection');
    const list = document.getElementById('createUserMachinesList');

    if (role === 'Technicien') {
        section.style.display = 'block';
        list.innerHTML = '<div style="color:var(--text-dim); padding:10px;">Chargement des machines...</div>';

        try {
            const machines = await getForklifts();
            if (machines.length === 0) {
                list.innerHTML = '<div style="color:var(--warning); padding:10px;">Aucune machine disponible.</div>';
                return;
            }
            list.innerHTML = machines.map(m => `
                <div style="display:flex; align-items:center; gap:10px; padding:5px 0;">
                    <input type="checkbox" name="assignedMachine" value="${m.deviceId}" id="chk_${m.deviceId}" style="width:16px; height:16px; cursor:pointer;">
                    <label for="chk_${m.deviceId}" style="cursor:pointer; font-size:0.9rem;">${m.name} (${m.model})</label>
                </div>
            `).join('');
        } catch (e) {
            list.innerHTML = '<div style="color:var(--danger); padding:10px;">Erreur de chargement.</div>';
        }
    } else {
        section.style.display = 'none';
    }
}
// Handler creation Admin/Technicien
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('addAdminForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('[type=submit]');
        const errEl = document.getElementById('adminError');
        errEl.style.display = 'none';

        const email = document.getElementById('adminEmail').value;
        const password = document.getElementById('adminPassword').value;
        const role = document.getElementById('adminRole').value;

        // Collect machines if technician
        let assignedMachines = [];
        if (role === 'Technicien') {
            const checked = document.querySelectorAll('input[name="assignedMachine"]:checked');
            assignedMachines = Array.from(checked).map(c => c.value);
        }

        btn.disabled = true; btn.textContent = 'Création...';

        try {
            const session = JSON.parse(localStorage.getItem('admin-session') || '{}');
            const parentAdminId = session.userId || session.id;
            const res = await fetch(`${API}/api/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, role, parentAdminId, assignedMachines })
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Erreur serveur');

            alert(`✅ Compte ${role} créé avec succès !`);
            closeAdminModal();
        } catch (err) {
            errEl.textContent = err.message;
            errEl.style.display = 'block';
        } finally {
            btn.disabled = false; btn.textContent = '✅ Créer Admin';
        }
    });
    document.getElementById('assignTechsToMachineForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('[type=submit]');
        const errEl = document.getElementById('assignTechsError');
        const deviceId = document.getElementById('assignTechsDeviceId').value;

        const checkboxes = document.querySelectorAll('.tech-assign-chk:checked');
        const technicianIds = Array.from(checkboxes).map(chk => chk.value);

        btn.disabled = true; btn.textContent = 'Enregistrement...';
        try {
            const res = await fetch(`${API}/api/machines/${deviceId}/technicians`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ technicianIds })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Erreur');

            closeAssignTechsToMachineModal();
            alert(`✅ Accès techniciens mis à jour pour ce chariot.`);
            await displayForklifts(); // Refresh to update status if needed
        } catch (err) {
            errEl.textContent = err.message;
            errEl.style.display = 'block';
        } finally {
            btn.disabled = false; btn.textContent = 'Enregistrer';
        }
    });
});
// ASSIGNATION TECHNICIENS A UNE MACHINE
// machineOwnerId = ownerId de la machine (permet au Super Admin de voir les techs du bon admin)
async function openAssignTechsToMachineModal(deviceId, machineName, machineOwnerId) {
    document.getElementById('assignTechsToMachineModal').classList.add('show');
    document.getElementById('assignTechsMachineName').textContent = machineName;
    document.getElementById('assignTechsDeviceId').value = deviceId;
    const container = document.getElementById('techsCheckboxList');
    container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-dim);">Chargement...</div>';

    try {
        const session = JSON.parse(localStorage.getItem('admin-session') || '{}');
        const parentId = session.userId || session.id;

        const sessionId = session.userId || session.id;
        const isSuperAdmin = session.role === 'Super Admin' || session.role === 'System Admin';
        // Fetch ma propre hiérarchie (backend retourne direct + imbriqués pour Super Admin)
        const res = await fetch(`${API}/api/users?parentAdminId=${sessionId}&requesterRole=${session.role}`);
        if (!res.ok) throw new Error("Erreur de chargement des utilisateurs");
        let allUsers = await res.json();
        // Si Super Admin et que la machine appartient à un sous-admin → fetch aussi ses techs directs
        if (isSuperAdmin && machineOwnerId && machineOwnerId !== sessionId && machineOwnerId !== '') {
            try {
                const resOwner = await fetch(`${API}/api/users?parentAdminId=${machineOwnerId}&requesterRole=Admin`);
                if (resOwner.ok) {
                    const ownerTeam = await resOwner.json();
                    const seen = new Set(allUsers.map(u => u._id));
                    ownerTeam.forEach(u => { if (!seen.has(u._id)) allUsers.push(u); });
                }
            } catch (_) { }
        }
        const technicians = allUsers.filter(u => u.role === 'Technicien');

        if (technicians.length === 0) {
            container.innerHTML = '<div style="color: var(--warning); padding: 20px; text-align:center;">Aucun technicien disponible.</div>';
            return;
        }

        container.innerHTML = technicians.map(t => {
            const isAssigned = (t.assignedMachines || []).includes(deviceId);
            const parentLabel = isSuperAdmin && t.parentAdminId && t.parentAdminId !== sessionId
                ? `<em style="font-size:0.68rem; color:var(--text-dim);"> (via sous-admin)</em>` : '';
            return `
                <div style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <input type="checkbox" id="tech_chk_${t._id}" value="${t._id}" class="tech-assign-chk" ${isAssigned ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
                    <label for="tech_chk_${t._id}" style="cursor: pointer; display: flex; flex-direction: column;">
                        <span style="color: var(--primary); font-weight: 700;">${t.email.split('@')[0]}${parentLabel}</span>
                        <span style="font-size: 0.75rem; color: var(--text-secondary);">${t.email}</span>
                    </label>
                </div>
            `;
        }).join('');
    } catch (e) {
        container.innerHTML = `<div style="color: var(--danger); text-align:center; padding: 20px;">${e.message}</div>`;
    }
}
function closeAssignTechsToMachineModal() {
    document.getElementById('assignTechsToMachineModal').classList.remove('show');
    document.getElementById('assignTechsError').style.display = 'none';
}
