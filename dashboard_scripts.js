<script>
            // --- CONFIGURATION GLOBALE ---
            const ESP32_IP = '192.168.4.1';  // IP par défaut du mode AP ESP32
            const BACKEND_URL = '/api/telemetry'; // API relative pour Vercel / Local

            // ─── 🤖 AI ASSISTANT WIDGET JS ───────────────────────────────────────────
            let _aiLastTelemetry = null; // Keeps latest telemetry for AI context

            function toggleAIPanel() {
                const panel = document.getElementById('aiPanel');
                panel.classList.toggle('open');
                if (panel.classList.contains('open')) {
                    document.getElementById('aiInput')?.focus();
                }
            }

            function askAI(question) {
                document.getElementById('aiInput').value = question;
                sendAIMessage();
            }

            async function sendAIMessage() {
                const input = document.getElementById('aiInput');
                const btn = document.getElementById('aiSendBtn');
                const messages = document.getElementById('aiMessages');
                const chips = document.getElementById('aiChips');

                const question = input.value.trim();
                if (!question) return;

                // Hide suggestion chips after first message
                if (chips) chips.style.display = 'none';

                // Add user message
                const userMsg = document.createElement('div');
                userMsg.className = 'ai-msg user';
                userMsg.textContent = question;
                messages.appendChild(userMsg);
                input.value = '';

                // Loading indicator
                const loading = document.createElement('div');
                loading.className = 'ai-msg loading';
                loading.textContent = '🤖 Gemini analyse...';
                messages.appendChild(loading);
                messages.scrollTop = messages.scrollHeight;

                btn.disabled = true;

                try {
                    const response = await fetch('/api/ai/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            question,
                            deviceId: currentDeviceId,
                            telemetry: _aiLastTelemetry // live sensor data context
                        })
                    });

                    loading.remove();

                    if (response.ok) {
                        const data = await response.json();
                        const botMsg = document.createElement('div');
                        botMsg.className = 'ai-msg bot';
                        botMsg.innerHTML = `<span style="font-size:0.65rem;color:#00d4ff;font-weight:700;display:block;margin-bottom:4px;">🤖 GEMINI</span>${data.answer}`;
                        messages.appendChild(botMsg);
                    } else {
                        const errMsg = document.createElement('div');
                        errMsg.className = 'ai-msg bot';
                        errMsg.textContent = '❌ Erreur de connexion à l\'IA. Vérifiez le serveur.';
                        messages.appendChild(errMsg);
                    }
                } catch (err) {
                    loading.remove();
                    const errMsg = document.createElement('div');
                    errMsg.className = 'ai-msg bot';
                    errMsg.textContent = '❌ Erreur: ' + err.message;
                    messages.appendChild(errMsg);
                } finally {
                    btn.disabled = false;
                    messages.scrollTop = messages.scrollHeight;
                    input.focus();
                }
            }

            function getCurrentOwnerId() {
                const s = localStorage.getItem('admin-session');
                if (!s) return null;
                const d = JSON.parse(s);
                if (d.role === 'System Admin') return 'ALL';
                return (d.role === 'Admin') ? d.userId : (d.parentAdminId || d.userId);
            }

            function getRequesterRole() {
                const s = localStorage.getItem('admin-session');
                if (!s) return '';
                const d = JSON.parse(s);
                return d.role || '';
            }

            function checkAuth() {
                const s = localStorage.getItem('admin-session');
                if (!s) { window.location.href = 'login.html'; return false; }
                const d = JSON.parse(s);
                if (!d.loggedIn) { window.location.href = 'login.html'; return false; }
                return true;
            }

            let dataSource = localStorage.getItem('dataSource') || 'esp32';

            // ─── SECURE DEVICE ID INITIALIZATION ─────────────────────────────────────
            // Never trust the URL param alone — validate against authorized machines.
            const _urlRequestedId = new URLSearchParams(window.location.search).get('id');
            // Synchronously prefer URL param to prevent race conditions during async validation
            let currentDeviceId = _urlRequestedId || localStorage.getItem('deviceId');

            // If an ID was passed via URL, verify the user is authorized to see it.
            if (_urlRequestedId) {
                (async function validateDeviceAccess() {
                    try {
                        const session = JSON.parse(localStorage.getItem('admin-session') || '{}');
                        const params = new URLSearchParams({
                            ownerId: session.userId || '',
                            requesterRole: session.role || '',
                            technicianId: session.userId || ''
                        });
                        const res = await fetch(`/api/machines?${params.toString()}`);
                        const machines = await res.json();
                        const authorized = machines.find(m => m.deviceId === _urlRequestedId);

                        if (authorized) {
                            // Authorized — officially lock it in
                            localStorage.setItem('deviceId', currentDeviceId);
                        } else {
                            // NOT authorized — redirect immediately
                            console.warn(`[SECURITY] Unauthorized access attempt to device: ${_urlRequestedId}`);
                            window.location.href = 'fleet.html';
                        }
                    } catch (err) {
                        console.error('[SECURITY] Could not validate device access:', err);
                        // On error, fall back (do not use URL param)
                        window.location.href = 'fleet.html';
                    }
                })();
            }
            // ─────────────────────────────────────────────────────────────────────────

            // Device badge initialization
            (function initDeviceName() {
                const nameEl = document.getElementById('deviceNameDisplay');
                if (nameEl) {
                    nameEl.textContent = currentDeviceId ? currentDeviceId.toUpperCase() : 'CHARIOT INCONNU';
                }

                // Redirection if deviceId is completely lost
                if (!currentDeviceId) {
                    console.error("No device ID found. Redirecting to fleet.");
                    window.location.href = 'fleet.html';
                }
            })();

            let lastDataTime = 0;
            let isGeofenceAlarmMuted = false;

            function markDeviceOnline() {
                const dotEl = document.getElementById('deviceStatusDot');
                const nameEl = document.getElementById('deviceNameDisplay');
                if (dotEl) dotEl.classList.remove('offline');
                if (nameEl) nameEl.textContent = currentDeviceId.toUpperCase();
                lastDataTime = Date.now();
            }

            function markDeviceOffline() {
                const dotEl = document.getElementById('deviceStatusDot');
                const nameEl = document.getElementById('deviceNameDisplay');
                if (dotEl) dotEl.classList.add('offline');
                if (nameEl) nameEl.textContent = 'OFFLINE';
            }

            // Heartbeat monitor: Si pas de données depuis 10s, mark offline
            setInterval(() => {
                if (Date.now() - lastDataTime > 10000 && lastDataTime !== 0) {
                    markDeviceOffline();
                }
            }, 5000);

            // Suppress MetaMask/Web3 extension errors
            window.addEventListener('unhandledrejection', function (event) {
                if (event.reason && (
                    (event.reason.message && event.reason.message.includes('MetaMask')) ||
                    (event.reason.code && event.reason.code === -32603)
                )) {
                    event.preventDefault();
                    console.warn('GTI: Suppressed extension-related rejection');
                }
            });
            const FETCH_INTERVAL = 3000;

            // --- SÉCURITÉ PROTOCOLE ---
            if (window.location.protocol === 'file:') {
                document.addEventListener('DOMContentLoaded', () => {
                    const warning = document.createElement('div');
                    warning.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.95); z-index: 10000;
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    color: white; font-family: 'Orbitron', sans-serif; text-align: center; padding: 20px;
                `;
                    warning.innerHTML = `
                    <h1 style="color: #ff3b30; font-size: 2.5rem; margin-bottom: 20px;">⚠️ ERREUR DE PROTOCOLE</h1>
                    <p style="font-size: 1.2rem; max-width: 600px; line-height: 1.6;">
                        Vous avez ouvert le fichier directement via votre explorateur de fichiers. 
                        Cela bloque l'accès aux données (CORS).
                    </p>
                    <div style="margin-top: 30px; background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px;">
                        <p style="margin-bottom: 15px; opacity: 0.8;">Veuillez utiliser l'URL suivante dans votre navigateur :</p>
                        <code style="font-size: 2rem; color: #007AFF;">http://localhost:3000</code>
                    </div>
                    <p style="margin-top: 40px; font-size: 0.9rem; opacity: 0.6;">
                        Assurez-vous que le serveur backend est lancé (npm start).
                    </p>
                `;
                    document.body.appendChild(warning);
                });
            }
            // Initialisation des données de télémétrie
            let telemetryData = {
                temp: 0,                // Température moteur (°C)
                oil_pressure: 0,        // Pression huile (bar)
                fuel_liters: 0,         // Carburant (litres)
                fuel_percent: 0,        // Carburant (%)
                rpm: 0,                 // Tours/minute (désactivé dans ESP32)
                gear: 0,                // Vitesse (1=AV, -1=AR, 0=N)
                engine_hours: 0,        // Heures moteur
                engine_on: false,       // État moteur
                lat: 0,                 // GPS Latitude
                lon: 0,                 // GPS Longitude
                speed: 0                // Vitesse GPS (km/h)
            };

            // Tracking pour heure de démarrage et consommation
            let engineStartTime = null;
            let lastFuelLevel = 0;
            let totalFuelConsumed = 0;
            let odometer = parseFloat(localStorage.getItem('odometer')) || 0;
            let lastLat = null;
            let lastLon = null;
            // Persist engine state across refreshes to only sweep on ACTUAL start
            let wasEngineRunning = localStorage.getItem('lastEngineState_' + currentDeviceId) === 'true';
            let isTachoSweeping = false;

            // Notification cooldown timers (ms) — prevent spam every 2s
            let lastOilNotifTime = 0;
            let lastFuelNotifTime = 0;
            let lastTempNotifTime = 0;
            let lastTheftNotifTime = 0;
            const ALERT_COOLDOWN_MS = 30000; // 30 seconds between same alert

            // Map Globals (Moved here to avoid ReferenceError)
            let map = null;
            let truckMarker = null;
            let proximityScanCircle = null; // Leaflet circle for rear proximity scan zone
            let proximityAlertCircle = null; // Blinking alert circle when obstacle detected

            /**
             * Calculate distance between two GPS points in Km (Haversine formula)
             */
            function calculateDistance(lat1, lon1, lat2, lon2) {
                if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
                const R = 6371; // Earth radius in km
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLon = (lon2 - lon1) * Math.PI / 180;
                const a =
                    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
            }

            // Initialize tachometer marks
            function initTachoMarks() {
                const marksGroup = document.getElementById('tachoMarks');
                const totalMarks = 9; // 0 to 8
                const startAngle = 150; // 8 o'clock
                const endAngle = 390;   // 4 o'clock (150 + 240)
                const angleStep = (endAngle - startAngle) / totalMarks;

                for (let i = 0; i <= totalMarks; i++) {
                    const angle = startAngle + (i * angleStep);
                    const radians = (angle * Math.PI) / 180;
                    const innerRadius = i >= 7 ? 160 : 170;
                    const outerRadius = i >= 7 ? 190 : 185;

                    const x1 = 225 + innerRadius * Math.cos(radians);
                    const y1 = 225 + innerRadius * Math.sin(radians);
                    const x2 = 225 + outerRadius * Math.cos(radians);
                    const y2 = 225 + outerRadius * Math.sin(radians);

                    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    mark.setAttribute('x1', x1);
                    mark.setAttribute('y1', y1);
                    mark.setAttribute('x2', x2);
                    mark.setAttribute('y2', y2);
                    // Blue lines at the BEGINNING (0-2) instead of the end
                    mark.setAttribute('class', i <= 2 ? 'tacho-mark-red' : 'tacho-mark');
                    marksGroup.appendChild(mark);
                }
            }

            let isFirstLoadData = true;
            const isTrue = (val) => val === true || val === 'true';

            // Gauge SVG Arc Logic (Circular progress)
            function updateGauge(arcId, value, maxValue) {
                const arc = document.getElementById(arcId);
                if (!arc) {
                    console.warn('[Dash] Missing gauge element:', arcId);
                    return;
                }
                const circumference = 2 * Math.PI * 110;
                const arcLength = (270 / 360) * circumference; // 270 degrees
                const offset = arcLength - (value / maxValue) * arcLength;
                arc.style.strokeDashoffset = circumference - arcLength + offset;
            }

            // Update tachometer needle with Car-style 0 position and Sweep support
            function updateTachometer(rpm, force = false) {
                if (isTachoSweeping && !force) return;

                const needle = document.getElementById('tachoNeedle');
                const rpmDisplay = document.getElementById('rpmDisplay');
                const maxRPM = 8000;
                const clampedRPM = Math.min(rpm, maxRPM);

                if (rpmDisplay) {
                    rpmDisplay.textContent = (clampedRPM / 1000).toFixed(1);
                }

                // NEEDLE POINTS UP (-90deg). 
                // GAUGE 0 is at 8 o'clock (+150deg). 
                // Rotation needed = 150 - (-90) = 240 degrees.
                const startAngle = 240;
                const range = 240;
                const angle = startAngle + (clampedRPM / maxRPM) * range;

                needle.style.transform = `rotate(${angle}deg)`;
                needle.style.transformOrigin = '225px 225px';
            }

            // Needle Sweep: Full 360 Rotation then back to final value
            function performTachoSweep(finalRPM) {
                if (isTachoSweeping) return;
                isTachoSweeping = true;

                const needle = document.getElementById('tachoNeedle');
                const tractor = document.getElementById('tachoTractor');
                const startAngle = 240;
                const duration = 1200;
                const start = performance.now();

                function animate(time) {
                    const elapsed = time - start;
                    const progress = elapsed / duration;

                    if (progress < 1) {
                        let currentAngle;
                        let tractorAngle;
                        if (progress < 0.6) {
                            // FAST SWEEP UP: Full 360 circle
                            const p = progress / 0.6;
                            currentAngle = startAngle + p * 360;
                            tractorAngle = p * 360;
                        } else {
                            // SMOOTH RETURN: to final RPM angle
                            const targetAngle = startAngle + (finalRPM / 8000) * 240;
                            const returnProgress = (progress - 0.6) / 0.4;
                            currentAngle = (startAngle + 360) - (returnProgress * (startAngle + 360 - targetAngle));
                            tractorAngle = 360 - (returnProgress * 360);
                        }
                        needle.style.transform = `rotate(${currentAngle}deg)`;
                        if (tractor) tractor.style.transform = `rotate(${tractorAngle}deg)`;
                        requestAnimationFrame(animate);
                    } else {
                        isTachoSweeping = false;
                        updateTachometer(finalRPM, true);
                        if (tractor) tractor.style.transform = 'rotate(0deg)';
                    }
                }
                requestAnimationFrame(animate);
            }

            // Setup Audio Context for Proximity Beep
            let audioCtx = null;
            let lastBeepTime = 0;

            function playProximityBeep(priority = 'normal') {
                try {
                    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    if (audioCtx.state === 'suspended') audioCtx.resume();

                    let delay = priority === 'high' ? 200 : 500;
                    // Rate limit beeps based on urgency
                    if (Date.now() - lastBeepTime < delay) return;
                    lastBeepTime = Date.now();

                    const oscillator = audioCtx.createOscillator();
                    const gainNode = audioCtx.createGain();

                    oscillator.type = 'square';
                    oscillator.frequency.value = priority === 'high' ? 1200 : 800; // Higher pitch for danger

                    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime); // 5% volume
                    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1); // 100ms duration

                    oscillator.connect(gainNode);
                    gainNode.connect(audioCtx.destination);

                    oscillator.start();
                    oscillator.stop(audioCtx.currentTime + 0.1);
                } catch (e) { console.warn("Audio Beep blocked by browser", e); }
            }

            // Update warning icons
            function updateWarnings(data) {
                const tempIcon = document.getElementById('tempIcon');
                const oilIcon = document.getElementById('oilIcon');
                const engineIcon = document.getElementById('engineIcon'); // Check Engine
                const fuelIcon = document.getElementById('fuelIcon');
                const fuelReserveIndicator = document.getElementById('fuelReserveIndicator');
                const proximityIcon = document.getElementById('proximityIcon');

                // === LAMP CHECK FEATURE ===
                // If engine is OFF but we have data (Ignition ON), light up ALL warnings
                if (!data.engine_on) {
                    tempIcon.classList.add('active');
                    oilIcon.classList.add('active');
                    engineIcon.classList.add('active');
                    fuelIcon.classList.add('active');
                    if (proximityIcon) proximityIcon.classList.remove('active', 'blink'); // Keep proxy off
                    return;
                }

                // === NORMAL RUNNING LOGIC (Engine ON) ===

                // Engine Temp (> 95°C or Sensor Error / NC)
                const isTempNcNow = isTrue(data.temp_nc);
                if (isTempNcNow || data.temp === null || data.temp === undefined || isNaN(data.temp) || data.temp < 0 || data.temp > 95) {
                    tempIcon.classList.add('active', 'blink');
                    if (isTempNcNow || data.temp === null || data.temp === undefined || isNaN(data.temp) || data.temp < 0) {
                        tempIcon.style.stroke = '#ff3b30'; // Red for error / NC
                    } else {
                        tempIcon.style.stroke = ''; // Default warning color for high temp
                    }
                } else {
                    tempIcon.classList.remove('active', 'blink');
                    tempIcon.style.stroke = ''; // Reset
                }

                // Oil Pressure LED & Banner
                const oilWarningIndicator = document.getElementById('oilWarningIndicator');
                const isOilNcNow = isTrue(data.oil_nc);
                const oilPressureVal = Number(data.oil_pressure);
                if (!isOilNcNow && !isNaN(oilPressureVal) && oilPressureVal < 0.5) {
                    oilIcon.classList.add('active', 'blink');
                    oilIcon.style.stroke = '#ff3b30'; // Force Red for critical
                    if (oilWarningIndicator) oilWarningIndicator.style.display = 'flex';
                } else {
                    oilIcon.classList.remove('active', 'blink');
                    oilIcon.style.stroke = '#ffa500'; // Back to Orange/Default
                    if (oilWarningIndicator) oilWarningIndicator.style.display = 'none';
                }

                // Check Engine LED
                engineIcon.classList.remove('active', 'blink');

                // Fuel LED: blink red if NC, blink orange if reserve, off if ok
                const isFuelNc = isTrue(data.fuel_nc);
                const fuelPct = (data.fuel_percent !== null && data.fuel_percent !== undefined && !isFuelNc) ? Number(data.fuel_percent) : (isFuelNc ? 100 : 0);

                if (isFuelNc) {
                    // NC state — blink RED to indicate wiring fault
                    fuelIcon.classList.add('active', 'blink');
                    fuelIcon.style.stroke = '#ff3b30';
                    fuelReserveIndicator.style.display = 'none';
                } else if (fuelPct < 15) {
                    fuelIcon.classList.add('active', 'blink');
                    fuelIcon.style.stroke = ''; // default orange
                    fuelReserveIndicator.style.display = 'flex';
                } else {
                    fuelIcon.classList.remove('active', 'blink');
                    fuelIcon.style.stroke = ''; // reset
                    fuelReserveIndicator.style.display = 'none';
                }

                // Proximity Sensor LED and Sound (When in Reverse)
                if (proximityIcon && (data.gear == -1 || data.gear == '-1')) {
                    const prox = parseFloat(data.proximity_cm);
                    if (!isNaN(prox) && prox >= 0) {
                        if (prox <= 80) { // DANGER (Red + Fast Beep)
                            proximityIcon.classList.add('active', 'blink');
                            proximityIcon.style.stroke = '#ff3b30';
                            playProximityBeep('high');
                        } else if (prox <= 150) { // CAUTION (Orange + Slow Beep)
                            proximityIcon.classList.add('active');
                            proximityIcon.classList.remove('blink');
                            proximityIcon.style.stroke = '#ffa500';
                            playProximityBeep('normal');
                        } else { // CLEAR
                            proximityIcon.classList.remove('active', 'blink');
                        }
                    } else {
                        proximityIcon.classList.remove('active', 'blink');
                    }
                } else if (proximityIcon) {
                    proximityIcon.classList.remove('active', 'blink');
                }
            }


            // Update dashboard with real ESP32 data
            function updateDashboard(data) {
                // Keep AI context updated with latest telemetry
                if (data && data.status !== 'waiting') _aiLastTelemetry = data;

                // 0. Handle Waiting or Offline State
                if (data.status === 'waiting') {
                    console.log("Status: Waiting for data...");
                    if (document.getElementById('connectionStatus')) {
                        document.getElementById('connectionStatus').textContent = " EN ATTENTE...";
                        document.getElementById('connectionStatus').style.color = "var(--text-secondary)";
                    }
                    initializeDashboard();
                    return;
                }

                // 1. Check for Stale Data (Offline Detection)
                const ts = data.timestamp || data.createdAt;
                if (ts) {
                    const dataTime = new Date(ts).getTime();
                    const now = Date.now();
                    const diff = (now - dataTime) / 1000; // seconds

                    console.log(`[DEBUG] Time Diff: ${diff.toFixed(1)}s (Limit: 60s)`);

                    if (diff > 60) { // If data is older than 60s
                        console.log(`Data is stale (${diff.toFixed(1)}s old) -> Offline Mode`);
                        markDeviceOffline();
                        if (document.getElementById('connectionStatus')) {
                            document.getElementById('connectionStatus').textContent = " HORS LIGNE (Données obsolètes)";
                            document.getElementById('connectionStatus').style.color = "var(--text-secondary)";
                            document.getElementById('connectionStatus').style.textShadow = "none";
                        }
                        initializeDashboard();
                        return;
                    }
                }

                // --- UTILISATION DES DONNEES PERSISTANTES (Backend Trip) ---
                const trip = data.trip || {};

                // Mise à jour de l'heure de démarrage
                const startTimeDisplay = document.getElementById('startTimeDisplay');
                const sbStartTime = document.getElementById('sbStartTime');
                let startTimeText = '--:--';
                let startTimeColor = 'var(--text-secondary)';

                if (trip.isRunning && trip.startTime) {
                    startTimeText = formatTime(new Date(trip.startTime));
                    startTimeColor = 'var(--accent-success)';
                } else if (!trip.isRunning && trip.startTime) {
                    startTimeText = formatTime(new Date(trip.startTime));
                }

                if (startTimeDisplay) {
                    startTimeDisplay.textContent = startTimeText;
                    startTimeDisplay.style.color = startTimeColor;
                }
                if (sbStartTime) {
                    sbStartTime.textContent = startTimeText;
                    sbStartTime.style.color = startTimeColor;
                }

                // Mise à jour de la consommation persistante (Ce voyage)
                const fuelConsText = (trip.fuelConsumed || 0).toFixed(1) + ' L';
                if (document.getElementById('fuelConsumptionDisplay')) {
                    document.getElementById('fuelConsumptionDisplay').textContent = fuelConsText;
                }
                if (document.getElementById('sbConsumption')) {
                    document.getElementById('sbConsumption').textContent = fuelConsText;
                }

                // Mise à jour Kilométrage (Odomètre permanent)
                const mileageText = (data.odometer || trip.mileage || 0).toFixed(1).replace('.', ',') + ' km';
                if (document.getElementById('odometerDisplay')) {
                    document.getElementById('odometerDisplay').textContent = mileageText;
                }
                if (document.getElementById('sbOdometer')) {
                    document.getElementById('sbOdometer').textContent = mileageText;
                }

                // Apply Calibration before updating UI
                applyCalibration(data);

                // Update Calibration UI with live values (Resistance)
                if (document.getElementById('currentFuelRes')) {
                    const fRes = data.fuel_res !== undefined ? data.fuel_res : (data.fuel_ohm !== undefined ? data.fuel_ohm : 0);
                    let displayRes = Math.round(fRes) + " Ω";
                    if (fRes > 500000.0) displayRes = "OUVERT";
                    else if (fRes < 0) displayRes = "ERREUR";

                    document.getElementById('currentFuelRes').textContent = displayRes;
                    if (document.getElementById('debugFuelRes')) {
                        document.getElementById('debugFuelRes').textContent = (fRes > 500000.0) ? "OUVERT" : fRes.toFixed(1) + " Ω";
                    }
                }
                if (document.getElementById('currentTempRes')) {
                    const tRes = data.temp_res !== undefined ? data.temp_res : (data.temp_ohm !== undefined ? data.temp_ohm : 0);
                    let displayRes = Math.round(tRes) + " Ω";
                    if (tRes > 500000.0) displayRes = "OUVERT";
                    else if (tRes < 0) displayRes = "ERREUR";

                    document.getElementById('currentTempRes').textContent = displayRes;
                    if (document.getElementById('debugTempRes')) {
                        document.getElementById('debugTempRes').textContent = (tRes > 500000.0) ? "OUVERT" : tRes.toFixed(1) + " Ω";
                    }
                }

                // 1. Détection de Vol de Gasoil
                // Guards: skip if current or previous packet was NC, or if fuel_liters is 0 (NC sends 0)
                const wasNc = isTrue(telemetryData && telemetryData.fuel_nc);
                const isCurrNc = isTrue(data.fuel_nc);
                const fuelLitersValid = data.fuel_liters !== null && data.fuel_liters !== undefined && Number(data.fuel_liters) > 0;

                if (lastFuelLevel > 0 && fuelLitersValid && Number(data.fuel_liters) < lastFuelLevel && !wasNc && !isCurrNc) {
                    // Local theft detection logic maintained for future internal use,
                    // but notification is handled entirely by backend/polling.
                }
                // Only update lastFuelLevel when we have a valid (non-NC) reading
                if (fuelLitersValid && !isCurrNc) lastFuelLevel = Number(data.fuel_liters);


                // Temperature (left gauge)
                if (data.temp_nc || data.temp === null || data.temp === undefined || isNaN(data.temp)) {
                    document.getElementById('tempValue').textContent = 'NC';
                    document.getElementById('tempValue').style.color = '#ff3b30';
                    updateGauge('tempArc', 0, 120);
                } else if (data.temp < 0 && data.temp > -50) { // Support negative valid temps if any
                    document.getElementById('tempValue').textContent = data.temp.toFixed(1).replace('.', ',');
                    document.getElementById('tempValue').style.color = 'var(--text-primary)';
                    updateGauge('tempArc', data.temp, 120);
                } else if (data.temp <= -50) { // Fallback for old firmware or extreme error
                    document.getElementById('tempValue').textContent = 'ERR';
                    document.getElementById('tempValue').style.color = '#ff3b30';
                    updateGauge('tempArc', 0, 120);
                } else {
                    document.getElementById('tempValue').textContent = data.temp.toFixed(1).replace('.', ',');
                    document.getElementById('tempValue').style.color = 'var(--text-primary)';
                    updateGauge('tempArc', data.temp, 120); // max 120°C
                    // Notification handled by backend
                }

                // Engine Hours (right gauge)
                let hours = data.engine_hours || 0;

                // Correction automatique: si la valeur est > 5000, elle est probablement en secondes
                if (hours > 5000) {
                    hours = hours / 3600;
                }

                document.getElementById('hoursValue').textContent = hours.toFixed(2).replace('.', ',');
                updateGauge('hoursArc', hours, 10000); // max 10000 heures

                // Tachometer with Startup Sweep (Triggered when oil pressure returns to normal >= 0.5)
                const rpmVal = data.rpm || 0;
                const oilP = data.oil_pressure !== undefined ? Number(data.oil_pressure) : 0;
                const isOilNormal = oilP >= 0.5;

                if (isOilNormal && !wasEngineRunning) {
                    // Oil pressure recovered or engine just started!
                    performTachoSweep(rpmVal);
                } else if (!isTachoSweeping) {
                    updateTachometer(rpmVal);
                }

                if (wasEngineRunning !== isOilNormal) {
                    wasEngineRunning = isOilNormal;
                    localStorage.setItem('lastEngineState_' + currentDeviceId, wasEngineRunning);
                }

                // Speed from GPS
                document.getElementById('speedValue').textContent = Math.round(data.speed || 0);

                // Engine Status (Synchronisé via le backend selon pression d'huile)
                const engineStatusText = document.getElementById('engineStatusText');
                const engineStatusIcon = document.getElementById('engineStatusIcon');

                // On utilise ici le statut strict issu du 'trip' calculé par le backend
                const isEngineRunningBackend = trip.isRunning === true;

                if (isEngineRunningBackend) {
                    if (engineStatusText) engineStatusText.textContent = 'MARCHE';
                    if (engineStatusText) engineStatusText.style.color = 'var(--accent-success)';
                    if (engineStatusIcon) engineStatusIcon.style.stroke = 'var(--accent-success)';
                } else {
                    if (engineStatusText) engineStatusText.textContent = 'ARRÊT';
                    if (engineStatusText) engineStatusText.style.color = 'var(--text-secondary)';
                    if (engineStatusIcon) engineStatusIcon.style.stroke = 'var(--text-secondary)';
                }

                // Gear Display (NEW)
                const gearDisplay = document.getElementById('gearDisplay');
                const debugGear = document.getElementById('debugGear');
                const gearVal = (data.gear !== undefined) ? Number(data.gear) : 0;

                if (debugGear) debugGear.textContent = `(${gearVal})`;

                let gearText = 'N';
                let gearColor = 'var(--text-secondary)';

                if (gearVal === 1) {
                    gearText = 'AV';
                    gearColor = 'var(--accent-success)';
                } else if (gearVal === -1) {
                    gearText = 'AR';
                    gearColor = '#ffa500';
                }

                gearDisplay.innerHTML = `${gearText} <span id="debugGear" style="font-size: 0.6rem; opacity: 0.5; margin-left: 5px;">(${gearVal})</span>`;
                gearDisplay.style.color = gearColor;

                // Pression d'huile Digitale
                const oilPressureDisplay = document.getElementById('oilPressureDisplay');
                const isOilNc = isTrue(data.oil_nc);
                if (isOilNc) {
                    oilPressureDisplay.textContent = 'NC';
                    oilPressureDisplay.style.color = '#ff3b30';
                    oilPressureDisplay.classList.remove('blink');
                } else {
                    const oilVal = data.oil_pressure != null ? Number(data.oil_pressure) : 0;
                    oilPressureDisplay.textContent = oilVal.toFixed(1) + ' Bar';
                    // Trigger strictly on pressure < 0.5, bypassing engine_on checks as requested
                    if (oilVal < 0.5 && !isOilNc && !isFirstLoadData) {
                        oilPressureDisplay.style.color = '#ff3b30';
                        oilPressureDisplay.classList.add('blink');
                        const nowMs = Date.now();
                        if (nowMs - lastOilNotifTime > ALERT_COOLDOWN_MS) {
                            showNotification('🚨 LOW_OIL_PRESSURE', 'Oil pressure too low for current RPM', 'danger');
                            lastOilNotifTime = nowMs;
                        }
                    } else {
                        oilPressureDisplay.style.color = 'var(--text-primary)';
                        oilPressureDisplay.classList.remove('blink');
                        // Normal state is implicitly handled by the backend's "OK" notification fetching
                    }
                }

                // Mise à jour de la carte
                if (data.lat !== 0 && data.lon !== 0) {
                    lastLat = data.lat;
                    lastLon = data.lon;
                }

                // Suppression des lignes redondantes d'odomètre ici car gérées plus haut avec trip.mileage


                // Update Map & GPS Info
                updateMap(data.lat, data.lon, data.sats);

                // Fuel Display
                const isFuelSensorNc = isTrue(data.fuel_nc);
                let fuelPct = isFuelSensorNc ? 100 : parseFloat(data.fuel_percent);
                if (isNaN(fuelPct)) fuelPct = isFuelSensorNc ? 100 : 0;

                // Cap at 100%
                fuelPct = Math.min(100, Math.max(0, fuelPct));

                const fuelVal = document.getElementById('fuel-val');
                const fuelDisplayPerc = document.getElementById('fuelDisplayPerc');
                const fuelDisplayLiters = document.getElementById('fuelDisplayLiters');
                const fuelDisplayMain = document.getElementById('fuelDisplayMain');

                if (fuelVal) fuelVal.textContent = fuelPct.toFixed(1);

                // Update Text Logic
                let fuelText = Math.round(fuelPct) + '%';
                let fuelColor = 'var(--text-primary)';

                if (Math.round(fuelPct) <= 0) {
                    fuelText = 'VIDE';
                    fuelColor = '#ff3b30';
                } else if (Math.round(fuelPct) <= 10) {
                    fuelColor = '#ff3b30';
                }

                if (fuelDisplayPerc) {
                    if (isFuelSensorNc) {
                        fuelDisplayPerc.textContent = 'NC';
                        fuelDisplayPerc.style.color = '#ff3b30';
                    } else {
                        fuelDisplayPerc.textContent = fuelText;
                        fuelDisplayPerc.style.color = fuelColor;
                    }
                }
                if (fuelDisplayLiters && data.fuel_liters != null) {
                    const flVal = Number(data.fuel_liters);
                    fuelDisplayLiters.textContent = isFuelSensorNc ? '(--- L)' : `(${flVal.toFixed(1)} L)`;
                    fuelDisplayLiters.style.display = 'inline';
                }

                if (fuelDisplayMain) {
                    if (isFuelSensorNc) {
                        fuelDisplayMain.textContent = 'NC';
                        fuelDisplayMain.style.color = '#ff3b30';
                    } else {
                        fuelDisplayMain.textContent = fuelText;
                        fuelDisplayMain.style.color = fuelColor;
                    }
                }


                // Fuel Liters Display
                const fuelLiters = document.getElementById('fuel-liters');
                if (fuelLiters && data && data.fuel_liters != null) {
                    fuelLiters.textContent = Number(data.fuel_liters).toFixed(1) + " L";
                }

                // Technician Debug Data
                const debugFuelRes = document.getElementById('debugFuelRes');
                const debugTempRes = document.getElementById('debugTempRes');

                if (debugFuelRes) {
                    let res = data.fuel_res !== undefined ? data.fuel_res : (data.fuel_ohm !== undefined ? data.fuel_ohm : 0);
                    debugFuelRes.textContent = Math.round(res) + " Ω";
                }
                if (debugTempRes) {
                    let res = data.temp_res !== undefined ? data.temp_res : 0;
                    debugTempRes.textContent = Math.round(res) + " Ω";
                }


                // Update warnings
                updateWarnings(data);

                // === PROXIMITY (JSN-SR04T) ===
                updateProximityWidget(data.proximity_cm);

                isFirstLoadData = false;
            }

            // ───────────────────────────────────────────────────────────────────────
            // PROXIMITY WIDGET — JSN-SR04T Rear Sensor
            // ───────────────────────────────────────────────────────────────────────
            const PROX_ALERT_CM = 80;   // Mirrors BSP.h PROXIMITY_ALERT_CM
            const PROX_WARNING_CM = 150;  // Mirrors BSP.h PROXIMITY_WARNING_CM
            const PROX_MAX_CM = 400;  // Mirrors BSP.h PROXIMITY_MAX_RANGE_CM

            let lastProxNotifTime = 0;
            const PROX_NOTIF_COOLDOWN_MS = 1000;

            function updateProximityWidget(proximityCm) {
                const widget = document.getElementById('proximityWidget');
                const display = document.getElementById('proxDistanceDisplay');
                const zoneLabel = document.getElementById('proxZoneLabel');
                const arc = document.getElementById('proxArc');
                const proxIcon = document.getElementById('proximityIcon');
                if (!widget || !display || !zoneLabel || !arc) return;

                const dist = parseFloat(proximityCm);
                const arcTotalLength = 117; // SVG path length for the half-arc
                const unitDisplay = document.getElementById('proxUnit');

                // ── Error / Disconnected / Out of Range ──
                if (isNaN(dist) || dist < -1) {
                    display.textContent = 'NC';
                    if (unitDisplay) unitDisplay.style.display = 'none';
                    display.style.fontSize = '1.8rem';
                    arc.style.stroke = '#86868b'; // grey — not an active alert
                    arc.style.strokeDashoffset = arcTotalLength; // empty
                    widget.className = 'proximity-widget'; // no danger pulse
                    zoneLabel.className = 'prox-zone-label';
                    zoneLabel.textContent = 'NC';
                    if (proxIcon) proxIcon.classList.remove('active', 'blink'); // Don't alarm if just NC
                    updateProxCircleOnMap(dist);
                    return;
                }

                // ── No obstacle / sensor timeout (-1) or clear (> 400) ──
                if (dist === -1 || dist >= PROX_MAX_CM) {
                    display.textContent = '--';
                    if (unitDisplay) unitDisplay.style.display = 'none';
                    display.style.fontSize = '1.8rem';
                    arc.style.stroke = '#34c759';
                    arc.style.strokeDashoffset = 0;
                    widget.className = 'proximity-widget';
                    zoneLabel.className = 'prox-zone-label clear';
                    zoneLabel.textContent = 'DÉGAGÉ';
                    if (proxIcon) proxIcon.classList.remove('active', 'blink');
                    updateProxCircleOnMap(dist);
                    return;
                }
                display.style.fontSize = '1.8rem';
                if (unitDisplay) unitDisplay.style.display = 'block';

                // ── Compute arc fill: closer = more filled (inverse) ──
                // dist 400cm (max) → offset = arcTotalLength (empty arc)
                // dist 0cm (min)   → offset = 0 (full arc)
                const clampedDist = Math.min(Math.max(dist, 0), PROX_MAX_CM);
                const fillRatio = 1.0 - (clampedDist / PROX_MAX_CM);
                const dashOffset = arcTotalLength * (1.0 - fillRatio);

                display.textContent = Math.round(dist);
                arc.style.strokeDashoffset = dashOffset;

                // ── Zone classification ──
                const now = Date.now();
                if (dist <= PROX_ALERT_CM) {
                    // 🔴 DANGER
                    arc.style.stroke = '#ff3b30';
                    widget.className = 'proximity-widget danger';
                    zoneLabel.className = 'prox-zone-label danger';
                    zoneLabel.textContent = 'DANGER!';
                    if (proxIcon) { proxIcon.classList.add('active', 'blink'); }

                    // Notification anti-spam
                    if (now - lastProxNotifTime > PROX_NOTIF_COOLDOWN_MS && !isFirstLoadData) {
                        showNotification(
                            '⚠️ OBSTACLE ARRIÈRE!',
                            `Objet détecté à ${Math.round(dist)} cm — DANGER`,
                            'danger'
                        );
                        lastProxNotifTime = now;
                    }
                } else if (dist <= PROX_WARNING_CM) {
                    // 🟠 CAUTION
                    arc.style.stroke = '#ffa500';
                    widget.className = 'proximity-widget caution';
                    zoneLabel.className = 'prox-zone-label caution';
                    zoneLabel.textContent = 'ATTENTION';
                    if (proxIcon) proxIcon.classList.remove('active', 'blink');
                } else {
                    // 🟢 CLEAR
                    arc.style.stroke = '#34c759';
                    widget.className = 'proximity-widget';
                    zoneLabel.className = 'prox-zone-label clear';
                    zoneLabel.textContent = 'OK';
                    if (proxIcon) proxIcon.classList.remove('active', 'blink');
                }

                updateProxCircleOnMap(dist);
            }

            function updateProxCircleOnMap(distCm) {
                if (!map || !truckMarker) return;
                const pos = truckMarker.getLatLng();

                // Remove old circles
                if (proximityScanCircle) { map.removeLayer(proximityScanCircle); proximityScanCircle = null; }
                if (proximityAlertCircle) { map.removeLayer(proximityAlertCircle); proximityAlertCircle = null; }

                const dist = parseFloat(distCm);
                if (isNaN(dist) || dist < 0) return;

                const radiusM = Math.max(dist / 100, 0.3); // cm → m, min 0.3m

                // Outer scan zone (always shown)
                proximityScanCircle = L.circle(pos, {
                    radius: radiusM,
                    color: dist <= PROX_ALERT_CM ? '#ff3b30' : (dist <= PROX_WARNING_CM ? '#ffa500' : '#34c759'),
                    fillColor: dist <= PROX_ALERT_CM ? '#ff3b30' : (dist <= PROX_WARNING_CM ? '#ffa500' : '#34c759'),
                    fillOpacity: 0.12,
                    weight: 2,
                    opacity: 0.7,
                    dashArray: dist <= PROX_ALERT_CM ? null : '5, 5',
                    className: 'leaflet-proximity-circle'
                }).addTo(map);

                // Obstacle marker in danger zone
                if (dist <= PROX_ALERT_CM) {
                    proximityAlertCircle = L.circle(pos, {
                        radius: radiusM,
                        color: '#ff3b30',
                        fillColor: '#ff3b30',
                        fillOpacity: 0.25,
                        weight: 3,
                        opacity: 1,
                        className: 'leaflet-proximity-circle'
                    }).addTo(map);
                }
            }

            // Format duration as decimal hours (e.g. 0.01)
            function formatDuration(totalSeconds) {
                return (totalSeconds / 3600).toFixed(2);
            }

            // Format time as HH:MM
            function formatTime(date) {
                const hours = date.getHours().toString().padStart(2, '0');
                const minutes = date.getMinutes().toString().padStart(2, '0');
                return `${hours}:${minutes}`;
            }

            // Notification system
            let notificationHistory = [];
            let lastNotificationTime = {};
            const NOTIFICATION_COOLDOWN = 60000; // 1 minute cooldown per notification type

            function showNotification(title, message, type = 'info') {
                // Prevent spam - only show same notification type once per minute
                // EXCEPT for 'danger' types (alerts) where we want more frequent updates
                const now = Date.now();
                // 5s for alerts, 2s for successes (user actions), 60s for generic spam
                const cooldown = (type === 'danger') ? 5000 : (type === 'success' ? 2000 : NOTIFICATION_COOLDOWN);

                if (lastNotificationTime[title] && (now - lastNotificationTime[title] < cooldown)) {
                    return;
                }
                lastNotificationTime[title] = now;

                // Add to history
                const notification = {
                    title,
                    message,
                    type,
                    timestamp: new Date().toLocaleTimeString('fr-FR')
                };
                notificationHistory.unshift(notification);
                if (notificationHistory.length > 10) notificationHistory.pop();

                // Create Visual Toast
                const container = document.getElementById('notificationContainer');
                const toast = document.createElement('div');
                toast.className = `notification-toast ${type}`;

                // Icon selection
                let icon = 'ℹ️';
                if (type === 'warning') icon = '⚠️';
                else if (type === 'danger') icon = '🚨';
                else if (type === 'success') icon = '✅';

                toast.innerHTML = `
                <div style="font-size: 1.5rem;">${icon}</div>
                <div>
                    <div style="font-weight: bold; margin-bottom: 2px; font-family: 'Orbitron', sans-serif;">${title}</div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary);">${message}</div>
                </div>
            `;

                container.appendChild(toast);

                // Update History UI if modal is open
                renderHistory();

                // Auto remove after 5 seconds
                setTimeout(() => {
                    toast.style.animation = 'fadeOut 0.5s ease-in forwards';
                    toast.addEventListener('animationend', () => {
                        if (toast.parentNode) {
                            toast.remove();
                        }
                    });
                }, 5000);

                // 🔔 Play sound in real-time when notification appears on screen
                if (window.intellimettryPlaySound) {
                    window.intellimettryPlaySound(type); // uses nav.js global
                } else {
                    // Fallback: inline Web Audio if nav.js not loaded
                    try {
                        const ctx = new (window.AudioContext || window.webkitAudioContext)();
                        const freq = type === 'danger' ? 880 : 523;
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.connect(gain); gain.connect(ctx.destination);
                        osc.type = 'sine'; osc.frequency.value = freq;
                        gain.gain.setValueAtTime(0, ctx.currentTime);
                        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
                        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
                        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
                    } catch (_) { }
                }

                // Log to console
                console.log(`[${type.toUpperCase()}] ${title}: ${message}`);
            }

            async function toggleHistory() {
                const modal = document.getElementById('historyModal');
                const isOpen = modal.classList.toggle('active');
                if (isOpen) {
                    try {
                        const ownerId = getCurrentOwnerId();
                        const role = getRequesterRole();
                        let url = `/api/notifications?deviceId=${currentDeviceId}&limit=50&requesterRole=${role}`;
                        if (ownerId !== 'ALL') url += `&ownerId=${ownerId}`;

                        const response = await fetch(url);
                        if (response.ok) {
                            const notifications = await response.json();
                            // Transform server format to display format
                            notificationHistory = notifications.map(n => ({
                                title: n.title,
                                message: n.message,
                                type: n.type || 'info',
                                timestamp: new Date(n.timestamp).toLocaleTimeString('fr-FR')
                            }));
                            renderHistory();
                        }
                    } catch (err) {
                        console.error('Failed to load notification history:', err);
                        renderHistory(); // Fallback to current session history
                    }
                }
            }

            function renderHistory() {
                const list = document.getElementById('historyList');
                if (!list) return;

                if (notificationHistory.length === 0) {
                    list.innerHTML = '<div style="text-align:center; color:var(--text-secondary); margin-top:20px;">Aucune notification</div>';
                    return;
                }

                list.innerHTML = notificationHistory.map(n => `
                <div class="history-item ${n.type}">
                    <div class="history-item-time">${n.timestamp}</div>
                    <div class="history-item-title">${n.title}</div>
                    <div class="history-item-msg">${n.message}</div>
                </div>
            `).join('');
            }


            // Data Logging for Export
            let telemetryHistory = [];
            const MAX_HISTORY_POINTS = 10000; // Store last 10000 points (~1-2 hours)

            // Initialize History from Database
            async function loadHistory() {
                // 1. Try Backend API first (Database/MQTT data)
                try {
                    const ownerId = getCurrentOwnerId();
                    const role = getRequesterRole();
                    let url = `/api/telemetry?deviceId=${currentDeviceId}&requesterRole=${role}`;
                    if (ownerId !== 'ALL') url += `&ownerId=${ownerId}`;

                    const response = await fetch(url);
                    if (response.ok) {
                        const data = await response.json();
                        updateDashboard(data);

                        if (document.getElementById('connectionStatus')) {
                            document.getElementById('connectionStatus').textContent = " CONNECTÉ (BACKEND)";
                            document.getElementById('connectionStatus').style.color = "var(--accent-success)";
                            document.getElementById('connectionStatus').style.textShadow = "0 0 10px var(--accent-success)";
                        }
                        return; // Success!
                    }
                } catch (e) {
                    console.warn("Backend fetch failed, trying fallback...", e);
                }

                // 2. Fallback to ESP32 Direct IP (Only if Backend fails)
                try {
                    /* 
                     * DIRECT CONNECTION REMOVED / DEPRECATED
                     * User requested to stop polling 192.168.4.1
                     */
                    throw new Error("Direct connection disabled");
                } catch (error) {
                    console.warn('Impossible de charger l\'historique:', error);
                }
            }

            // Fetch telemetry data
            async function fetchTelemetry() {
                try {
                    // Bloquer le HTTP non sécurisé si on est sur HTTPS
                    if (window.location.protocol === 'https:' && dataSource !== 'adafruit') {
                        dataSource = 'adafruit';
                        localStorage.setItem('dataSource', 'adafruit');
                        const radio = document.getElementById('radioAdafruit');
                        if (radio) radio.checked = true;
                    }

                    // URL Construction: Local vs API (MongoDB)
                    // FORCE BACKEND BY DEFAULT for now to avoid timeouts
                    if (dataSource !== 'adafruit') {
                        console.log("Forcing DataSource to Backend/Adafruit since Direct IP is timing out");
                        dataSource = 'adafruit';
                        localStorage.setItem('dataSource', 'adafruit');
                    }

                    const ownerId = getCurrentOwnerId();
                    const role = getRequesterRole();
                    let url = `/api/telemetry?deviceId=${currentDeviceId}&requesterRole=${role}`;
                    if (ownerId !== 'ALL') url += `&ownerId=${ownerId}`;

                    const response = await fetch(url);
                    if (response.ok) {
                        const data = await response.json();

                        // Si le serveur dit "waiting", c'est qu'il n'y a pas de données fraîches en DB
                        if (data.status === 'waiting') {
                            if (Date.now() - lastDataTime > 10000) markDeviceOffline();
                            return;
                        }

                        // Mark device as online
                        markDeviceOnline();

                        updateDashboard(data);
                        telemetryData = data;

                        // Log data localement pour export
                        if (telemetryHistory.length > MAX_HISTORY_POINTS) telemetryHistory.shift();
                        telemetryHistory.push({
                            time: new Date().toLocaleTimeString(),
                            timestamp: Date.now(),
                            rpm: data.rpm || 0,
                            speed: data.speed || 0,
                            temp: data.temp || 0,
                            oil: data.oil_pressure || 0,
                            fuel: data.fuel_liters || 0,
                            gear: data.gear || 0
                        });

                        updateCharts(data);
                    }
                } catch (error) {
                    // Connexion impossible -> hors ligne
                    markDeviceOffline();
                }
            }

            // --- POLL NOTIFICATIONS ---
            let lastNotificationTimestamp = 0;
            let isFirstLoadNotifs = true;

            async function fetchNotifications() {
                try {
                    const ownerId = getCurrentOwnerId();
                    const role = getRequesterRole();
                    let url = `/api/notifications?deviceId=${currentDeviceId}&limit=20&requesterRole=${role}`;
                    if (ownerId !== 'ALL') url += `&ownerId=${ownerId}`;

                    const response = await fetch(url);
                    if (!response.ok) return;

                    const notifications = await response.json();

                    if (isFirstLoadNotifs) {
                        if (notifications.length > 0) {
                            lastNotificationTimestamp = Math.max(...notifications.map(n => new Date(n.timestamp).getTime()));
                            // Silently add to history
                            notificationHistory = notifications.map(n => ({
                                title: n.title,
                                message: n.message,
                                type: n.type || 'info',
                                timestamp: new Date(n.timestamp).toLocaleTimeString('fr-FR')
                            }));
                        }
                        isFirstLoadNotifs = false;
                        return;
                    }

                    // Process from oldest to newest to show in order
                    const newNotifications = notifications
                        .filter(n => new Date(n.timestamp).getTime() > lastNotificationTimestamp)
                        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

                    if (newNotifications.length > 0) {
                        newNotifications.forEach(n => {
                            // Avoid re-showing if purely duplicate based on content within short time
                            // (Handled by showNotification logic too, but good to have)
                            showNotification(n.title, n.message, n.type || 'info');
                            lastNotificationTimestamp = Math.max(lastNotificationTimestamp, new Date(n.timestamp).getTime());
                        });
                    } else if (notifications.length > 0) {
                        // Update high watermark just in case
                        const latest = Math.max(...notifications.map(n => new Date(n.timestamp).getTime()));
                        if (latest > lastNotificationTimestamp) lastNotificationTimestamp = latest;
                    }
                } catch (e) {
                    console.error("Error fetching notifications:", e);
                }
            }

            // Start polling loops
            setInterval(fetchTelemetry, FETCH_INTERVAL);
            setInterval(fetchNotifications, 2000); // Check for alerts every 2 seconds

            // --- DASHBOARD SETTINGS ---
            function setDeviceId(id) {
                currentDeviceId = id;
                localStorage.setItem('deviceId', id);
                loadHistory(); // Recharger les données pour le nouveau chariot
            }

            // Start initialization
            loadHistory();

            // Export History to CSV
            async function exportHistory() {
                // Afficher chargement
                showNotification('Génération PDF', 'Récupération depuis la base de données...', 'info');

                // 1. Récupérer l'historique depuis MongoDB
                const ownerId = getCurrentOwnerId();
                const role = getRequesterRole();
                let url = `/api/history?deviceId=${currentDeviceId}&limit=500&requesterRole=${role}`;
                if (ownerId !== 'ALL') url += `&ownerId=${ownerId}`;

                let dbData = [];
                try {
                    const res = await fetch(url);
                    if (res.ok) {
                        dbData = await res.json();
                    }
                } catch (e) { console.error('Erreur fetch historique:', e); }

                if (dbData.length === 0) {
                    // Fallback sur la mémoire locale si hors-ligne
                    if (telemetryHistory.length > 0) {
                        dbData = telemetryHistory.slice(-500);
                    } else {
                        showNotification('Export Impossible', 'Aucune donnée enregistrée dans la base', 'warning');
                        return;
                    }
                }

                // 2. Charger jsPDF et AutoTable (si pas déjà fait via nav.js)
                if (!window.jspdf) {
                    await new Promise((resolve) => {
                        const s = document.createElement('script');
                        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                        s.onload = resolve;
                        document.head.appendChild(s);
                    });
                    await new Promise((resolve) => {
                        const s = document.createElement('script');
                        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js';
                        s.onload = resolve;
                        document.head.appendChild(s);
                    });
                }

                // 3. Préparer le document
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('portrait');
                let currentY = 15;

                // 4. Charger et ajouter le Logo
                try {
                    const res = await fetch('logo.png');
                    const blob = await res.blob();
                    const logoBase64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                    doc.addImage(logoBase64, 'PNG', 14, currentY, 40, 15);
                    currentY += 20;
                } catch (e) { console.warn("Logo non chargé", e); }

                // 5. En-tête
                doc.setFontSize(22);
                doc.setTextColor(0, 114, 170);
                doc.setFont("helvetica", "bold");
                doc.text('IntelliMettry - Historique Télémétrie', 14, currentY);
                currentY += 8;

                doc.setFontSize(10);
                doc.setTextColor(100, 100, 100);
                doc.setFont("helvetica", "normal");
                const truckName = document.getElementById('deviceIdTitle')?.textContent || currentDeviceId || 'Inconnu';
                doc.text(`Chariot: ${truckName} | Généré le: ${new Date().toLocaleString('fr-FR')}`, 14, currentY);
                currentY += 12;

                // 6. Tableau
                const tableHeaders = [['Heure', 'Vitesse (km/h)', 'RPM', 'Temp (°C)', 'Huile (Bar)', 'Carburant', 'Vitesse Eng.']];

                const tableData = dbData.map(p => {
                    let timeStr = p.time;
                    if (p.timestamp && !timeStr) {
                        const d = new Date(p.timestamp);
                        if (!isNaN(d)) timeStr = d.toLocaleTimeString('fr-FR');
                    }
                    if (!timeStr) timeStr = '--:--:--';

                    return [
                        timeStr,
                        p.speed || '0',
                        p.rpm || '0',
                        p.temp || '0',
                        (p.oil !== undefined ? Number(p.oil) : (p.oil_pressure !== undefined ? Number(p.oil_pressure) : 0)).toFixed(2),
                        (p.fuel !== undefined ? Number(p.fuel) : (p.fuel_percent !== undefined ? Number(p.fuel_percent) : 0)).toFixed(1) + '%',
                        p.gear || 'N'
                    ];
                });

                doc.autoTable({
                    head: tableHeaders,
                    body: tableData,
                    startY: currentY,
                    theme: 'striped',
                    headStyles: { fillColor: [0, 212, 255], textColor: [0, 0, 0], fontStyle: 'bold' },
                    styles: { fontSize: 9, cellPadding: 3, halign: 'center' },
                    alternateRowStyles: { fillColor: [245, 250, 255] },
                    margin: { top: 20 },
                    didDrawPage: function (data) {
                        doc.setFontSize(8);
                        doc.setTextColor(150, 150, 150);
                        doc.text('© 2026 Inovaria Tech - IntelliMettry Dashboard', data.settings.margin.left, doc.internal.pageSize.height - 10);
                        doc.text(`Page 1`, doc.internal.pageSize.width - 20, doc.internal.pageSize.height - 10);
                    }
                });

                // 7. Sauvegarde
                doc.save(`IntelliMettry_Historique_${currentDeviceId}_${new Date().toISOString().slice(0, 10)}.pdf`);
                showNotification('Export Réussi', `PDF généré depuis la base de données (${dbData.length} relevés)`, 'success');
            }

            // Reset Engine Hours


            // Initialize dashboard with placeholders
            function initializeDashboard() {
                if (document.getElementById('tempValue')) document.getElementById('tempValue').textContent = '---';
                if (document.getElementById('oilPressureDisplay')) document.getElementById('oilPressureDisplay').textContent = '---';
                if (document.getElementById('fuelDisplayPerc')) document.getElementById('fuelDisplayPerc').textContent = '---';
                if (document.getElementById('fuelDisplayLiters')) document.getElementById('fuelDisplayLiters').textContent = '';
                if (document.getElementById('rpmDisplay')) document.getElementById('rpmDisplay').textContent = '----';
                if (document.getElementById('speedValue')) document.getElementById('speedValue').textContent = '---';
                if (document.getElementById('gearDisplay')) document.getElementById('gearDisplay').textContent = '-';
                if (document.getElementById('hoursValue')) document.getElementById('hoursValue').textContent = '----';
                if (document.getElementById('startTimeDisplay')) document.getElementById('startTimeDisplay').textContent = '--:--';
                if (document.getElementById('sbStartTime')) document.getElementById('sbStartTime').textContent = '--:--';
                if (document.getElementById('fuelConsumptionDisplay')) document.getElementById('fuelConsumptionDisplay').textContent = '--- L';
                if (document.getElementById('sbConsumption')) document.getElementById('sbConsumption').textContent = '--- L';
                if (document.getElementById('odometerDisplay')) document.getElementById('odometerDisplay').textContent = '--- km';
                if (document.getElementById('sbOdometer')) document.getElementById('sbOdometer').textContent = '--- km';

                // updateDashboard(telemetryData); // Don't show zeros
            }

            // ============= CHARTS INITIALIZATION =============
            let tempChartInstance, oilChartInstance, fuelChartInstance;
            const MAX_CHART_POINTS = 50; // Keep last 50 data points
            const chartData = {
                labels: [],
                temp: [],
                oil: [],
                fuel: []
            };

            // Chart configuration
            const chartConfig = {
                type: 'line',
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                color: '#86868b',
                                maxTicksLimit: 8
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.05)'
                            }
                        },
                        y: {
                            ticks: {
                                color: '#86868b'
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.05)'
                            }
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    }
                }
            };

            // Initialize Temperature Chart
            function initTempChart() {
                const ctx = document.getElementById('tempChart').getContext('2d');
                tempChartInstance = new Chart(ctx, {
                    ...chartConfig,
                    data: {
                        labels: chartData.labels,
                        datasets: [{
                            label: 'Température (°C)',
                            data: chartData.temp,
                            borderColor: '#ff3b30',
                            backgroundColor: 'rgba(255, 59, 48, 0.1)',
                            borderWidth: 2,
                            tension: 0.4,
                            fill: true
                        }]
                    },
                    options: {
                        ...chartConfig.options,
                        scales: {
                            ...chartConfig.options.scales,
                            y: {
                                ...chartConfig.options.scales.y,
                                min: 0,
                                max: 120,
                                ticks: {
                                    ...chartConfig.options.scales.y.ticks,
                                    callback: function (value) {
                                        return value + '°C';
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // Initialize Oil Pressure Chart
            function initOilChart() {
                const ctx = document.getElementById('oilChart').getContext('2d');
                oilChartInstance = new Chart(ctx, {
                    ...chartConfig,
                    data: {
                        labels: chartData.labels,
                        datasets: [{
                            label: 'Pression (Bar)',
                            data: chartData.oil,
                            borderColor: '#ffa500',
                            backgroundColor: 'rgba(255, 165, 0, 0.1)',
                            borderWidth: 2,
                            tension: 0.4,
                            fill: true
                        }]
                    },
                    options: {
                        ...chartConfig.options,
                        scales: {
                            ...chartConfig.options.scales,
                            y: {
                                ...chartConfig.options.scales.y,
                                min: 0,
                                max: 5,
                                ticks: {
                                    ...chartConfig.options.scales.y.ticks,
                                    callback: function (value) {
                                        return value + ' Bar';
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // Initialize Fuel Chart
            function initFuelChart() {
                const ctx = document.getElementById('fuelChart').getContext('2d');
                fuelChartInstance = new Chart(ctx, {
                    ...chartConfig,
                    data: {
                        labels: chartData.labels,
                        datasets: [{
                            label: 'Carburant (%)',
                            data: chartData.fuel,
                            borderColor: '#00d4ff',
                            backgroundColor: 'rgba(0, 212, 255, 0.1)',
                            borderWidth: 2,
                            tension: 0.4,
                            fill: true
                        }]
                    },
                    options: {
                        ...chartConfig.options,
                        scales: {
                            ...chartConfig.options.scales,
                            y: {
                                ...chartConfig.options.scales.y,
                                min: 0,
                                max: 100,
                                ticks: {
                                    ...chartConfig.options.scales.y.ticks,
                                    callback: function (value) {
                                        return value + '%';
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // Update charts with new data
            function updateCharts(data) {
                const now = new Date();
                const timeLabel = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                // Add new data point
                chartData.labels.push(timeLabel);
                chartData.temp.push(data.temp || 0);
                chartData.oil.push(data.oil_pressure || 0);
                chartData.fuel.push(data.fuel_percent || 0);

                // Keep only last MAX_CHART_POINTS
                if (chartData.labels.length > MAX_CHART_POINTS) {
                    chartData.labels.shift();
                    chartData.temp.shift();
                    chartData.oil.shift();
                    chartData.fuel.shift();
                }

                // Update charts
                if (tempChartInstance) tempChartInstance.update('none');
                if (oilChartInstance) oilChartInstance.update('none');
                if (fuelChartInstance) fuelChartInstance.update('none');
            }

            // Initialize dashboard components
            document.addEventListener('DOMContentLoaded', function () {
                initTachoMarks();
                initializeDashboard();
                loadCalibrationSettings();

                // Initialize charts
                if (typeof Chart !== 'undefined') {
                    initTempChart();
                    initOilChart();
                    initFuelChart();
                } else {
                    console.warn('[OFFLINE] Chart.js non chargé - Graphiques désactivés');
                    document.querySelectorAll('.chart-card').forEach(card => {
                        card.innerHTML += '<div style="color:var(--text-secondary); font-size:0.8rem; margin-top:20px;">Mode hors-ligne : Graphiques indisponibles</div>';
                    });
                }
            });


            // Reset engine hours via API (MQTT)
            async function resetEngineHours() {
                if (!confirm("Voulez-vous vraiment réinitialiser les heures moteur à zéro ?")) return;

                try {
                    // Use backend API which publishes MQTT command
                    const response = await fetch('/api/reset-hours', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ deviceId: currentDeviceId })
                    });

                    const result = await response.json();

                    if (response.ok) {
                        showNotification('Commande Envoyée', 'Demande de reset transmise au chariot', 'success');
                        // We don't reset local display immediately wait for next telemetry update
                        // but we can optimistically reset for UX
                        document.getElementById('hoursValue').textContent = '0.00';
                        updateGauge('hoursArc', 0, 10000);
                    } else {
                        showNotification('Erreur', result.message || 'Impossible de réinitialiser', 'danger');
                    }
                } catch (error) {
                    console.error('Erreur reset:', error);
                    showNotification('Erreur Connexion', 'Impossible de contacter le backend', 'danger');
                }
            }

            // Start fetching data
            setInterval(fetchTelemetry, FETCH_INTERVAL);

            // Capture current resistance into input


            // ============= COLOR CUSTOMIZATION SYSTEM =============

            // Toggle settings panel
            // Toggle settings panel
            function toggleSettingsPanel(tab) {
                const panel = document.getElementById('colorPanel');
                const toggleTheme = document.getElementById('colorPanelToggle');

                // Explicit close (passed null or called from X button)
                if (!tab) {
                    panel.style.display = 'none';
                    if (toggleTheme) toggleTheme.style.visibility = 'visible';
                    return;
                }

                // Check if panel is visible
                const isOpen = panel.style.display !== 'none';

                // Determine currently active section
                const isThemeActive = document.getElementById('sectionTheme').style.display === 'block';

                // Show proper section
                document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('[id^="section"]').forEach(s => s.style.display = 'none');

                // For now only theme is supported in this function, but kept structure
                document.getElementById('sectionTheme').style.display = 'block';
                document.getElementById('tabMainTheme').classList.add('active');

                if (isOpen && tab === 'theme') {
                    // Toggle OFF if clicking same tab
                    panel.style.display = 'none';
                    if (toggleTheme) toggleTheme.style.visibility = 'visible';
                } else {
                    panel.style.display = 'block';
                    if (toggleTheme) toggleTheme.style.visibility = 'hidden';
                }
            }


            // ============= CALIBRATION LOGIC =============

            // Helper to get raw float from text (e.g. "123 Ω" -> 123.0)
            function parseRes(elementId) {
                const txt = document.getElementById(elementId).textContent;
                return parseFloat(txt.replace(/[^\d.-]/g, '')) || 0;
            }

            function applyFuelPreset(type) {
                const emptyInput = document.getElementById('calibFuelEmpty');
                const fullInput = document.getElementById('calibFuelFull');

                if (type === 'gti_orig') {
                    emptyInput.value = 12;
                    fullInput.value = 166;
                } else if (type === 'isuzu_240_33') {
                    emptyInput.value = 240;
                    fullInput.value = 33;
                } else if (type === 'vdo_10_180') {
                    emptyInput.value = 10;
                    fullInput.value = 180;
                }
            }

            function captureFuelEmpty() {
                const val = parseFloat(telemetryData.fuel_res) || 0;
                if (val > 500000) {
                    alert("Erreur : La sonde semble déconnectée (Résistance infinie).");
                    return;
                }
                document.getElementById('calibFuelEmpty').value = Math.round(val);
            }

            function captureFuelFull() {
                const val = parseFloat(telemetryData.fuel_res) || 0;
                if (val > 500000) {
                    alert("Erreur : La sonde semble déconnectée (Résistance infinie).");
                    return;
                }
                document.getElementById('calibFuelFull').value = Math.round(val);
            }

            // --- Helper Calibration Functions ---
            function toggleAdvancedTempCalib() {
                const panel = document.getElementById('tempCalibAdvanced');
                const isHidden = panel.style.display === 'none';
                panel.style.display = isHidden ? 'block' : 'none';
            }

            function applyTempPreset(type) {
                const betaInput = document.getElementById('calibTempBeta');
                const r0Input = document.getElementById('calibTempR0');

                if (type === 'gti_orig') {
                    betaInput.value = 3950;
                    r0Input.value = 3025;
                } else if (type === 'isuzu_c240') {
                    betaInput.value = 3950;
                    r0Input.value = 9000;
                } else if (type === 'ntc_10k') {
                    betaInput.value = 3950;
                    r0Input.value = 10000;
                }
                // Show advanced if custom is selected
                if (type === 'custom') {
                    document.getElementById('tempCalibAdvanced').style.display = 'block';
                }
            }

            function calculateAutoOffset() {
                const realVal = parseFloat(document.getElementById('calibRealTemp').value);
                if (isNaN(realVal)) {
                    alert("Veuillez entrer une température réelle lue sur le thermomètre.");
                    return;
                }

                // Get current displayed temp from the main dashboard variable
                const currentDashTemp = telemetryData.temp || 0;

                // Offset = Difference
                const newOffset = realVal - currentDashTemp;

                // Update input
                document.getElementById('calibTempOffset').value = newOffset.toFixed(1);
                showNotification('Offset calculé', `Nouvel offset: ${newOffset.toFixed(1)}°C (Basé sur ${currentDashTemp.toFixed(1)}°C affichés)`, 'info');
            }

            async function saveCalibration() {
                const settings = {
                    fuelEmpty: parseFloat(document.getElementById('calibFuelEmpty').value),
                    fuelFull: parseFloat(document.getElementById('calibFuelFull').value),
                    fuelTank: parseFloat(document.getElementById('calibFuelTank').value),
                    tempBeta: parseFloat(document.getElementById('calibTempBeta').value),
                    tempR0: parseFloat(document.getElementById('calibTempR0').value),
                    tempOffset: parseFloat(document.getElementById('calibTempOffset').value)
                };

                if (confirm(`Confirmer l'envoi de la calibration ?\n\nNouveaux paramètres :\n- Fuel Vide: ${settings.fuelEmpty}Ω\n- Fuel Plein: ${settings.fuelFull}Ω\n- Temp Offset: ${settings.tempOffset}°C`)) {
                    try {
                        const response = await fetch(`/api/calibrate?deviceId=${currentDeviceId}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(settings)
                        });

                        const result = await response.json();

                        if (response.ok) {
                            showNotification('Calibration Appliquée', 'Les nouveaux paramètres ont été envoyés avec succès au chariot.', 'success');
                        } else {
                            showNotification('❌ Erreur', result.message || 'Erreur technique durant l\'envoi', 'danger');
                        }
                    } catch (e) {
                        console.error(e);
                        showNotification('❌ Erreur Connexion', 'Le serveur ne répond pas. Vérifiez votre connexion.', 'danger');
                    }
                }
            }

            function switchSettingsTab(tab) {
                const tabTheme = document.getElementById('tabMainTheme');
                const tabSource = document.getElementById('tabMainSource');
                const secTheme = document.getElementById('sectionTheme');
                const secSource = document.getElementById('sectionSource');

                if (tabTheme) tabTheme.classList.remove('active');
                if (tabSource) tabSource.classList.remove('active');
                if (secTheme) secTheme.style.display = 'none';
                if (secSource) secSource.style.display = 'none';

                if (tab === 'source') {
                    if (tabSource) tabSource.classList.add('active');
                    if (secSource) secSource.style.display = 'block';
                    document.getElementById('colorPanel').style.borderColor = 'var(--accent-success)';

                    // Set radio buttons and input
                    if (document.getElementById('deviceIdInput')) document.getElementById('deviceIdInput').value = currentDeviceId;
                    if (dataSource === 'adafruit') document.getElementById('radioAdafruit').checked = true;
                    else document.getElementById('radioEsp32').checked = true;
                } else {
                    if (tabTheme) tabTheme.classList.add('active');
                    if (secTheme) secTheme.style.display = 'block';
                    document.getElementById('colorPanel').style.borderColor = 'var(--accent-intellimettry)';
                }
            }

            function setDataSource(source) {
                dataSource = source;
                localStorage.setItem('dataSource', source);
                console.log("Source changée vers:", source);
                showNotification('Source Données', `Lecture via ${source.toUpperCase()}`, 'info');
            }

            async function loadCalibrationSettings() {
                try {
                    const response = await fetch(`/api/calibrate?deviceId=${currentDeviceId}`);

                    const settings = await response.json();
                    if (!response.ok) {
                        console.error("❌ Erreur calibration:", settings.message);
                        showNotification('Erreur Config', settings.message || 'Impossible de charger la calibration', 'danger');
                        return;
                    }
                    if (Object.keys(settings).length === 0) return;

                    console.log("📂 Chargement de la calibration:", settings);

                    if (settings.fuelEmpty !== undefined) document.getElementById('calibFuelEmpty').value = settings.fuelEmpty;
                    if (settings.fuelFull !== undefined) document.getElementById('calibFuelFull').value = settings.fuelFull;
                    if (settings.fuelTank !== undefined) document.getElementById('calibFuelTank').value = settings.fuelTank;
                    if (settings.tempBeta !== undefined) document.getElementById('calibTempBeta').value = settings.tempBeta;
                    if (settings.tempR0 !== undefined) document.getElementById('calibTempR0').value = settings.tempR0;
                    if (settings.tempOffset !== undefined) document.getElementById('calibTempOffset').value = settings.tempOffset;

                } catch (e) {
                    console.error("Erreur chargement calibration:", e);
                }
            }







            function applyCalibration(data) {
                // Calibration removed.
                // We rely on ESP32 pre-calculated values.
            }

            // Calibration / Reset Function
            function calibrateSensors() {
                if (confirm("Voulez-vous réinitialiser l'affichage et l'historique des capteurs ?")) {
                    // Clear local history
                    telemetryHistory = [];
                    notificationHistory = [];
                    lastNotificationTime = {};

                    // Clear notifications visually
                    const container = document.getElementById('notificationContainer');
                    if (container) container.innerHTML = '';

                    // Visual Feedback
                    showNotification('Maintenance', 'Calibration effectuée. Historique effacé.', 'success');

                    // Optional: Reload page to fully reset state if needed
                    // location.reload(); 
                }
            }

            // ============= 3D MODEL VIEWER =============

            let scene, camera, renderer, forkliftModel, controls;
            let modelRotationSpeed = 0;

            function init3DViewer() {
                if (typeof THREE === 'undefined') {
                    console.warn('[OFFLINE] Three.js non chargé - Visualisation 3D désactivée');
                    return;
                }
                const canvas = document.getElementById('modelCanvas');
                if (!canvas) return;
                const container = canvas.parentElement;

                // Scene setup
                scene = new THREE.Scene();
                scene.background = null; // Transparent background

                // Camera
                const aspect = container.clientWidth / container.clientHeight;
                camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
                camera.position.set(5, 3, 5);
                camera.lookAt(0, 0, 0);

                // Renderer
                renderer = new THREE.WebGLRenderer({
                    canvas: canvas,
                    alpha: true,
                    antialias: true
                });
                renderer.setSize(container.clientWidth, container.clientHeight);
                renderer.setPixelRatio(window.devicePixelRatio);

                // Lights
                const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
                scene.add(ambientLight);

                const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
                directionalLight1.position.set(5, 10, 5);
                scene.add(directionalLight1);

                const directionalLight2 = new THREE.DirectionalLight(0x4a90e2, 0.3);
                directionalLight2.position.set(-5, 5, -5);
                scene.add(directionalLight2);

                // Controls
                controls = new THREE.OrbitControls(camera, renderer.domElement);
                controls.enableDamping = true;
                controls.dampingFactor = 0.05;
                controls.enableZoom = true;
                controls.autoRotate = false;
                controls.maxPolarAngle = Math.PI / 2;

                // Load OBJ model
                console.log('[3D] Tentative de chargement du modèle Forklift.obj...');

                // Check if OBJLoader exists
                if (typeof THREE.OBJLoader === 'undefined') {
                    console.error('[3D] OBJLoader non disponible! Vérifiez que le script est chargé.');
                    createFallbackModel();
                    return;
                }

                const loader = new THREE.OBJLoader();

                // Add timeout for loading
                let loadTimeout = setTimeout(() => {
                    console.warn('[3D] Timeout de chargement - Utilisation du modèle de secours');
                    createFallbackModel();
                }, 5000);

                loader.load(
                    'Forklift.obj',
                    function (object) {
                        clearTimeout(loadTimeout);
                        console.log('[3D] Modèle OBJ chargé avec succès!');

                        // Center and scale the model
                        const box = new THREE.Box3().setFromObject(object);
                        const center = box.getCenter(new THREE.Vector3());
                        const size = box.getSize(new THREE.Vector3());

                        // Center the model
                        object.position.x = -center.x;
                        object.position.y = -center.y;
                        object.position.z = -center.z;

                        // Scale to fit
                        const maxDim = Math.max(size.x, size.y, size.z);
                        const scale = 2.5 / maxDim;
                        object.scale.setScalar(scale);

                        // Apply color based on theme
                        object.traverse(function (child) {
                            if (child instanceof THREE.Mesh) {
                                child.material = new THREE.MeshPhongMaterial({
                                    color: 0xffa500, // Orange color for forklift
                                    shininess: 30,
                                    specular: 0x333333
                                });
                            }
                        });

                        forkliftModel = object;
                        scene.add(object);
                        console.log('[3D] Modèle de chariot ajouté à la scène');
                    },
                    function (xhr) {
                        const percent = (xhr.loaded / xhr.total * 100);
                        if (xhr.loaded > 0) {
                            console.log(`[3D] Chargement: ${percent.toFixed(1)}%`);
                        }
                    },
                    function (error) {
                        clearTimeout(loadTimeout);
                        console.error('[3D] Erreur de chargement du modèle:', error);
                        console.warn('[3D] Création d\'un modèle de secours...');
                        createFallbackModel();
                    }
                );
            }

            // Create a simple fallback forklift model
            function createFallbackModel() {
                console.log('[3D] Création d\'un chariot simplifié...');

                const group = new THREE.Group();

                // Main body (orange)
                const bodyGeometry = new THREE.BoxGeometry(1, 0.6, 1.5);
                const bodyMaterial = new THREE.MeshPhongMaterial({
                    color: 0xffa500,
                    shininess: 30
                });
                const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
                body.position.y = 0.3;
                group.add(body);

                // Cabin (dark)
                const cabinGeometry = new THREE.BoxGeometry(0.8, 0.5, 0.7);
                const cabinMaterial = new THREE.MeshPhongMaterial({
                    color: 0x333333,
                    transparent: true,
                    opacity: 0.7
                });
                const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
                cabin.position.set(0, 0.8, -0.2);
                group.add(cabin);

                // Forks (gray)
                const forkMaterial = new THREE.MeshPhongMaterial({ color: 0x888888 });
                const fork1Geometry = new THREE.BoxGeometry(0.1, 0.05, 1.2);
                const fork1 = new THREE.Mesh(fork1Geometry, forkMaterial);
                fork1.position.set(-0.25, 0.1, 1);
                group.add(fork1);

                const fork2 = new THREE.Mesh(fork1Geometry, forkMaterial);
                fork2.position.set(0.25, 0.1, 1);
                group.add(fork2);

                // Wheels (black)
                const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x222222 });
                const wheelGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16);

                const wheels = [
                    { x: -0.4, z: 0.6 },
                    { x: 0.4, z: 0.6 },
                    { x: -0.4, z: -0.6 },
                    { x: 0.4, z: -0.6 }
                ];

                wheels.forEach(pos => {
                    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
                    wheel.position.set(pos.x, 0.15, pos.z);
                    wheel.rotation.z = Math.PI / 2;
                    group.add(wheel);
                });

                // Scale and position
                group.scale.setScalar(1.5);

                forkliftModel = group;
                scene.add(group);
                console.log('[3D] Modèle de chariot simplifié créé');
            }

            // Load/Create forklift model
            function loadForkliftModel() {
                // For now, we use the simple forklift model
                // In the future, you could load an external OBJ/GLB file here
                createFallbackModel();
            }

            // Initialize 3D viewer
            function init3DViewer() {
                const canvas = document.getElementById('modelCanvas');
                if (!canvas) {
                    console.error('[3D] Canvas non trouvé!');
                    return;
                }

                const container = canvas.parentElement;

                // Scene setup
                scene = new THREE.Scene();
                scene.background = null; // Transparent background

                // Camera
                const aspect = container.clientWidth / container.clientHeight;
                camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
                camera.position.set(5, 3, 5);
                camera.lookAt(0, 0, 0);

                // Renderer
                renderer = new THREE.WebGLRenderer({
                    canvas: canvas,
                    alpha: true,
                    antialias: true
                });
                renderer.setSize(container.clientWidth, container.clientHeight);
                renderer.setPixelRatio(window.devicePixelRatio);

                // Lights
                const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
                scene.add(ambientLight);

                const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
                directionalLight1.position.set(5, 10, 5);
                scene.add(directionalLight1);

                const directionalLight2 = new THREE.DirectionalLight(0x4a90e2, 0.3);
                directionalLight2.position.set(-5, 5, -5);
                scene.add(directionalLight2);

                // Controls
                if (typeof THREE.OrbitControls !== 'undefined') {
                    controls = new THREE.OrbitControls(camera, renderer.domElement);
                    controls.enableDamping = true;
                    controls.dampingFactor = 0.05;
                    controls.enableZoom = true;
                    controls.autoRotate = false;
                    controls.maxPolarAngle = Math.PI / 2;
                } else {
                    console.warn('[3D] OrbitControls non disponible');
                }

                // Try to load OBJ model
                if (typeof THREE.OBJLoader !== 'undefined') {
                    loadForkliftModel();
                } else {
                    createFallbackModel();
                }

                // Animation loop
                function animate() {
                    requestAnimationFrame(animate);

                    // Rotate model based on telemetry
                    if (forkliftModel) {
                        // Auto-rotate slowly when engine is on
                        if (telemetryData.engine_on) {
                            modelRotationSpeed = 0.002;
                        } else {
                            modelRotationSpeed *= 0.95; // Slowdown when engine off
                        }

                        forkliftModel.rotation.y += modelRotationSpeed;

                        // Tilt slightly based on gear
                        if (telemetryData.gear === 1) {
                            // Forward - tilt forward slightly
                            forkliftModel.rotation.x = THREE.MathUtils.lerp(forkliftModel.rotation.x, -0.05, 0.05);
                        } else if (telemetryData.gear === -1) {
                            // Reverse - tilt back slightly
                            forkliftModel.rotation.x = THREE.MathUtils.lerp(forkliftModel.rotation.x, 0.05, 0.05);
                        } else {
                            // Neutral - level
                            forkliftModel.rotation.x = THREE.MathUtils.lerp(forkliftModel.rotation.x, 0, 0.05);
                        }
                    }

                    controls.update();
                    renderer.render(scene, camera);
                }

                animate();

                // Handle window resize
                window.addEventListener('resize', onWindowResize, false);
            }

            function onWindowResize() {
                const container = document.querySelector('.model-viewer');
                if (!container) return;

                camera.aspect = container.clientWidth / container.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(container.clientWidth, container.clientHeight);
            }

            // Initialize 3D viewer after page load
            window.addEventListener('load', function () {
                if (typeof THREE !== 'undefined') init3DViewer();
                if (typeof L !== 'undefined') initMap();
            });

            // ============= MAP SYSTEM =============
            // map & truckMarker declared globally at top

            // Neon trail polyline reference
            let neonTrail = null;
            const trailPoints = [];
            const MAX_TRAIL_POINTS = 60;
            let lastMarkerBearing = 0;

            // Geofencing variables
            let geofenceCircle = null;
            let geofencePolygon = null;
            let geofenceType = 'circle'; // 'circle' or 'polygon'
            let polygonPoints = [];
            let isDefiningZone = false;
            let geofenceCenter = JSON.parse(localStorage.getItem('geofenceCenter')) || null;
            let geofenceRadius = Number(localStorage.getItem('geofenceRadius')) || 100;
            let storedPolygon = JSON.parse(localStorage.getItem('geofencePolygon')) || [];
            let lastGeofenceAlertTime = 0;
            let isGeofenceActive = false;
            const GEOFENCE_ALERT_COOLDOWN = 60000;

            /**
             * Fetches persistent geofence settings from the backend.
             */
            async function fetchGeofenceFromBackend() {
                try {
                    const response = await fetch(`/api/machines`);
                    const machines = await response.json();
                    const machine = machines.find(m => m.deviceId === currentDeviceId);

                    if (machine && machine.geofence && machine.geofence.isActive) {
                        const { lat, lon, radius } = machine.geofence;
                        geofenceCenter = [lat, lon];
                        geofenceRadius = radius;
                        isGeofenceActive = true; // Activer depuis le serveur

                        // Update UI and Map
                        if (geofenceCircle) map.removeLayer(geofenceCircle);
                        drawGeofence(geofenceCenter);

                        if (document.getElementById('radiusValue')) {
                            document.getElementById('radiusValue').textContent = geofenceRadius + 'm';
                        }

                        console.log(`[GEOFENCE] Loaded from backend: ${lat}, ${lon} (r=${radius}m)`);
                    }
                } catch (err) {
                    console.error('[GEOFENCE] Failed to fetch from backend:', err);
                }
            }

            function getBearing(lat1, lon1, lat2, lon2) {
                const toRad = d => d * Math.PI / 180;
                const toDeg = r => r * 180 / Math.PI;
                const dLon = toRad(lon2 - lon1);
                const y = Math.sin(dLon) * Math.cos(toRad(lat2));
                const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
                    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
                return (toDeg(Math.atan2(y, x)) + 360) % 360;
            }

            function buildForkliftSVG(accentColor) {
                return `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42">
                <!-- Radar Scanner Ring (Active in Reverse) -->
                <circle class="radar-pulse-ring" id="mapRadarRing" cx="10" cy="23" r="10" fill="none" stroke="#ff3b30"/>
                
                <!-- Rear Detection Dots -->
                <circle class="prox-spot" id="mapSpot1" cx="6" cy="23" r="2.5" fill="#34c759"/>
                <circle class="prox-spot" id="mapSpot2" cx="1" cy="23" r="2" fill="#ffa500"/>
                <circle class="prox-spot" id="mapSpot3" cx="-4" cy="23" r="1.5" fill="#ff3b30"/>

                <!-- Body -->
                <rect x="10" y="16" width="18" height="14" rx="3" fill="${accentColor}" opacity="0.95"/>
                <!-- Cab -->
                <rect x="12" y="10" width="10" height="9" rx="2" fill="${accentColor}" opacity="0.7"/>
                <!-- Mast -->
                <rect x="25" y="6" width="4" height="22" rx="1" fill="#ccc" opacity="0.9"/>
                <!-- Forks -->
                <rect x="27" y="26" width="12" height="2" rx="1" fill="#aaa"/>
                <rect x="27" y="30" width="12" height="2" rx="1" fill="#aaa"/>
                <!-- Wheels -->
                <circle cx="14" cy="31" r="4" fill="#222" stroke="#555" stroke-width="1"/>
                <circle cx="24" cy="31" r="4" fill="#222" stroke="#555" stroke-width="1"/>
              </svg>`;
            }

            function initMap() {
                if (typeof L === 'undefined') {
                    console.warn('[OFFLINE] Leaflet non chargé - Carte désactivée');
                    const mapDiv = document.getElementById('map');
                    if (mapDiv) mapDiv.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-secondary); background:var(--bg-glass); font-family:Orbitron;">CARTE INDISPONIBLE (HORS-LIGNE)</div>';
                    return;
                }
                console.log('[MAP] Initialisation de la carte industrielle...');

                map = L.map('map', {
                    zoomControl: false,
                    attributionControl: false
                }).setView([36.8065, 10.1815], 17);

                // Light tile layer — CartoDB Positron (White Map)
                L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                    maxZoom: 22
                }).addTo(map);

                // Neon BLUE path trail (always blue as requested)
                const trailColor = '#00aaff';
                neonTrail = L.polyline([], {
                    color: trailColor,
                    weight: 4,
                    opacity: 0.9,
                    className: 'neon-trail'
                }).addTo(map);

                // Custom forklift SVG marker (uses theme accent color)
                const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-gti').trim() || '#ff9500';
                const truckIcon = L.divIcon({
                    className: 'industrial-marker',
                    html: buildForkliftSVG(accentColor),
                    iconSize: [42, 42],
                    iconAnchor: [21, 21]
                });

                truckMarker = L.marker([36.8065, 10.1815], { icon: truckIcon }).addTo(map);
                truckMarker.bindPopup("🚜 Chariot - LIVE");

                // Initialize Geofence if exists
                if (geofenceCenter) {
                    drawGeofence(geofenceCenter);
                    if (document.getElementById('radiusValue')) {
                        document.getElementById('radiusValue').textContent = geofenceRadius + 'm';
                    }
                }

                // Also try fetching the most recent persistent geofence from the backend
                fetchGeofenceFromBackend();

                // Map click handler for geofencing
                map.on('click', function (e) {
                    if (isDefiningZone) {
                        if (geofenceType === 'circle') {
                            geofenceCenter = [e.latlng.lat, e.latlng.lng];
                            localStorage.setItem('geofenceCenter', JSON.stringify(geofenceCenter));
                            drawGeofence();
                            isGeofenceActive = false;
                            toggleGeofenceMode(); // Exit mode for circle
                        } else {
                            // Polygon mode: Add point
                            polygonPoints.push([e.latlng.lat, e.latlng.lng]);
                            drawGeofence();
                            isGeofenceActive = false;
                        }
                    }
                });


                // Inject neon glow and radar animations
                const style = document.createElement('style');
                style.textContent = `
                .neon-trail {
                    filter: drop-shadow(0 0 5px #00aaff) drop-shadow(0 0 12px #00aaff88);
                }
                .leaflet-container { background: #0a0d12 !important; }
                
                @keyframes radar-pulse {
                    0% { transform: scale(0.6); opacity: 1; stroke-width: 2; }
                    100% { transform: scale(1.6); opacity: 0; stroke-width: 0.5; }
                }
                .radar-pulse-ring {
                    transform-origin: 10px 23px; /* Center of forklift body rear */
                    animation: radar-pulse 2s infinite ease-out;
                    display: none;
                }
                .prox-spot {
                    transition: fill 0.4s ease, opacity 0.4s ease;
                    opacity: 0;
                }
                .industrial-marker { transition: transform 0.3s ease; }
            `;
                document.head.appendChild(style);
            }

            function updateMap(lat, lon, sats = 0) {
                const gpsStatus = document.getElementById('gpsStatus');
                const gmapsLink = document.getElementById('gmapsLink');
                const latDisplay = document.getElementById('latDisplay');
                const lonDisplay = document.getElementById('lonDisplay');
                const gpsSats = document.getElementById('gpsSats');

                if (gpsSats) gpsSats.textContent = sats || 0;

                const nLat = Number(lat);
                const nLon = Number(lon);
                const hasFix = !isNaN(nLat) && !isNaN(nLon) && (nLat !== 0 || nLon !== 0);

                if (latDisplay) latDisplay.textContent = hasFix ? nLat.toFixed(6) : "--.------";
                if (lonDisplay) lonDisplay.textContent = hasFix ? nLon.toFixed(6) : "--.------";

                if (!hasFix) {
                    if (gpsStatus) { gpsStatus.textContent = "SANS FIX"; gpsStatus.style.color = "#ff3b30"; }
                    if (gmapsLink) gmapsLink.style.display = 'none';
                    return;
                }

                if (gpsStatus) { gpsStatus.textContent = "FIX OK"; gpsStatus.style.color = "var(--accent-success)"; }
                if (gmapsLink) { gmapsLink.href = `https://www.google.com/maps?q=${nLat},${nLon}`; gmapsLink.style.display = 'flex'; }

                // Update Visual Leaflet Map with industrial neon-blue trail
                if (map && truckMarker) {
                    try {
                        const newPos = [nLat, nLon];
                        const prevPos = trailPoints.length > 0 ? trailPoints[trailPoints.length - 1] : null;

                        // Rotate marker toward direction of movement
                        if (prevPos && (Math.abs(nLat - prevPos[0]) > 0.000005 || Math.abs(nLon - prevPos[1]) > 0.000005)) {
                            const bearing = getBearing(prevPos[0], prevPos[1], nLat, nLon);
                            lastMarkerBearing = bearing;
                            const el = truckMarker.getElement();
                            if (el) el.style.transform = `rotate(${bearing}deg)`;
                        }

                        // Move marker
                        truckMarker.setLatLng(newPos);

                        // Update Radar Scanner & Spots
                        const mEl = truckMarker.getElement();
                        if (mEl) {
                            const ring = mEl.querySelector('#mapRadarRing');
                            const s1 = mEl.querySelector('#mapSpot1');
                            const s2 = mEl.querySelector('#mapSpot2');
                            const s3 = mEl.querySelector('#mapSpot3');

                            const prox = parseFloat(telemetryData.proximity_cm);
                            const isRev = (telemetryData.gear === -1 || telemetryData.gear == '-1');

                            if (isRev && ring) {
                                ring.style.display = 'block';
                                // Dynamic color
                                const color = (prox >= 0 && prox <= 80) ? '#ff3b30' : (prox <= 150 ? '#ffa500' : '#34c759');
                                ring.style.stroke = color;

                                // Dots visibility
                                if (s1) { s1.style.opacity = (prox >= 0 && prox <= 400) ? 1 : 0; s1.style.fill = color; }
                                if (s2) { s2.style.opacity = (prox >= 0 && prox <= 150) ? 1 : 0; s2.style.fill = color; }
                                if (s3) { s3.style.opacity = (prox >= 0 && prox <= 80) ? 1 : 0; s3.style.fill = color; }
                            } else if (ring) {
                                ring.style.display = 'none';
                                if (s1) s1.style.opacity = 0;
                                if (s2) s2.style.opacity = 0;
                                if (s3) s3.style.opacity = 0;
                            }
                        }

                        // Append to blue neon trail
                        trailPoints.push(newPos);
                        if (trailPoints.length > MAX_TRAIL_POINTS) trailPoints.shift();
                        if (neonTrail) {
                            neonTrail.setLatLngs(trailPoints);
                        }

                        // Smooth pan
                        map.panTo(newPos, { animate: true, duration: 0.8 });

                        // GEOFENCE CHECK
                        if (isGeofenceActive) {
                            let isInside = false;
                            let distance = 0;

                            if (geofenceType === 'circle' && geofenceCenter) {
                                distance = map.distance(newPos, geofenceCenter);
                                isInside = distance <= geofenceRadius;
                            } else if (geofenceType === 'polygon' && polygonPoints.length >= 3) {
                                isInside = isPointInPolygon(newPos, polygonPoints);
                                // For polygon, distance is 0 if inside, 1 if outside for the alert trigger message
                                distance = isInside ? 0 : 1;
                            }

                            if (isInside) {
                                if (isGeofenceAlarmMuted) isGeofenceAlarmMuted = false;
                            } else if (!isGeofenceAlarmMuted) {
                                checkAndTriggerGeofenceAlert(distance);
                            }
                        }
                    } catch (e) {
                        console.error('[MAP] Position error:', e);
                    }
                }
            }

            /**
             * Ray-casting algorithm for point-in-polygon detection
             */
            function isPointInPolygon(point, vs) {
                const x = point[0], y = point[1];
                let inside = false;
                for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
                    const xi = vs[i][0], yi = vs[i][1];
                    const xj = vs[j][0], yj = vs[j][1];
                    const intersect = ((yi > y) !== (yj > y))
                        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                    if (intersect) inside = !inside;
                }
                return inside;
            }

            function toggleGeofenceMode() {
                isDefiningZone = !isDefiningZone;
                const btn = document.getElementById('btnGeofence');
                const status = document.getElementById('geofenceStatus');
                if (isDefiningZone) {
                    btn.classList.add('active');
                    status.style.display = 'block';
                } else {
                    btn.classList.remove('active');
                    status.style.display = 'none';
                }
            }

            function setGeofenceMode(mode) {
                geofenceType = mode;
                document.getElementById('btnModeCircle').classList.toggle('active', mode === 'circle');
                document.getElementById('btnModePolygon').classList.toggle('active', mode === 'polygon');
                document.getElementById('circleControls').style.display = mode === 'circle' ? 'flex' : 'none';

                // Clear current draft points if switching
                if (isDefiningZone) {
                    polygonPoints = [];
                    geofenceCenter = null;
                    if (geofenceCircle) map.removeLayer(geofenceCircle);
                    if (geofencePolygon) map.removeLayer(geofencePolygon);
                }
            }

            function drawGeofence() {
                if (geofenceCircle) map.removeLayer(geofenceCircle);
                if (geofencePolygon) map.removeLayer(geofencePolygon);

                if (geofenceType === 'circle' && geofenceCenter) {
                    geofenceCircle = L.circle(geofenceCenter, {
                        radius: geofenceRadius,
                        color: '#ff0033',
                        fillColor: '#ff0033',
                        fillOpacity: 0.1,
                        weight: 2,
                        dashArray: '5, 10',
                        className: 'neon-geofence'
                    }).addTo(map);
                } else if (geofenceType === 'polygon' && polygonPoints.length > 0) {
                    geofencePolygon = L.polygon(polygonPoints, {
                        color: '#ff0033',
                        fillColor: '#ff0033',
                        fillOpacity: 0.1,
                        weight: 2,
                        dashArray: '5, 10',
                        className: 'neon-geofence'
                    }).addTo(map);

                    // Add markers for polygon points while defining
                    if (isDefiningZone) {
                        polygonPoints.forEach(p => {
                            L.circleMarker(p, { radius: 4, color: '#ff0033' }).addTo(map);
                        });
                    }
                }

                // Add style for neon geofence if not exists
                if (!document.getElementById('geofence-neon-style')) {
                    const style = document.createElement('style');
                    style.id = 'geofence-neon-style';
                    style.textContent = `
                    .neon-geofence {
                        filter: drop-shadow(0 0 5px #ff0033) drop-shadow(0 0 10px #ff003344);
                        animation: geofencePulse 2s infinite ease-in-out;
                    }
                    @keyframes geofencePulse {
                        0% { opacity: 0.6; stroke-width: 2; }
                        50% { opacity: 0.9; stroke-width: 3; }
                        100% { opacity: 0.6; stroke-width: 2; }
                    }
                `;
                    document.head.appendChild(style);
                }
            }

            function updateGeofenceRadius(delta) {
                geofenceRadius = Math.max(10, geofenceRadius + delta); // Min 10m
                localStorage.setItem('geofenceRadius', geofenceRadius);

                const radiusDisplay = document.getElementById('radiusValue');
                if (radiusDisplay) radiusDisplay.textContent = geofenceRadius + 'm';

                if (geofenceCenter) {
                    drawGeofence(geofenceCenter);
                }

                showNotification('Zone de Sécurité', `Rayon ajusté à ${geofenceRadius}m`, 'info');
            }

            async function triggerTruckAlarm(state) {
                try {
                    const ownerId = getCurrentOwnerId();
                    const commandFeed = "feeds/truck-commands";

                    await fetch('/api/command', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            deviceId: currentDeviceId,
                            ownerId: ownerId,
                            feed: commandFeed,
                            command: 'TRIGGER_ALARM',
                            state: state // 'on' or 'off'
                        })
                    });

                    const stopBtn = document.getElementById('btnStopAlarm');
                    const geofenceBtn = document.getElementById('btnGeofence');

                    if (state === 'on') {
                        if (stopBtn) stopBtn.style.display = 'flex';
                        if (geofenceBtn) geofenceBtn.classList.add('active'); // RED LED
                        showNotification('🚨 ALARME ACTIVÉE', 'L\'alarme du chariot a été déclenchée !', 'danger');
                    } else {
                        if (stopBtn) stopBtn.style.display = 'none';
                        if (geofenceBtn) {
                            geofenceBtn.classList.remove('active');
                            geofenceBtn.classList.remove('monitoring'); // TURN OFF LED completely as requested
                        }

                        // Set Mute flag
                        isGeofenceAlarmMuted = true;

                        // -- NEW: Clear the zone completely so user can define a new one --
                        geofenceCenter = null;
                        isGeofenceActive = false;
                        if (geofenceCircle) {
                            map.removeLayer(geofenceCircle);
                            geofenceCircle = null;
                        }

                        // Clear localStorage so it doesn't reload instantly on refresh
                        localStorage.removeItem('geofenceCenter');

                        // -- NEW: Erase from backend so it does not persist on page reload --
                        try {
                            fetch(`/api/machines/${currentDeviceId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ geofence: null })
                            });
                        } catch (e) {
                            console.error('Failed to clear geofence on backend:', e);
                        }

                        showNotification('✅ ALARME ARRÊTÉE', 'L\'alarme est coupée et la zone est réinitialisée. Vous pouvez définir une nouvelle zone.', 'success');
                    }
                } catch (err) {
                    console.error('Failed to trigger truck alarm:', err);
                }
            }

            async function checkAndTriggerGeofenceAlert(distance) {
                const now = Date.now();
                if (now - lastGeofenceAlertTime < GEOFENCE_ALERT_COOLDOWN) return;

                lastGeofenceAlertTime = now;

                const deviceId = currentDeviceId || 'default_truck';
                console.warn(`🚨 GEOFENCE BREACH: ${distance.toFixed(0)}m from center`);

                // Trigger physical alarm in truck
                triggerTruckAlarm('on');

                // Backend Alert via fetch
                try {
                    const ownerId = getCurrentOwnerId();
                    await fetch('/api/notifications', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            deviceId: deviceId,
                            ownerId: ownerId,
                            title: '🚨 Sortie de Zone',
                            message: `Le chariot a quitté sa zone de sécurité (${distance.toFixed(0)}m du centre).`,
                            type: 'danger'
                        })
                    });
                    if (typeof displayNotifications === 'function') displayNotifications();
                } catch (err) {
                    console.error('Failed to send geofence alert:', err);
                }
            }

            async function saveGeofenceToBackend() {
                if (geofenceType === 'circle' && !geofenceCenter) {
                    showNotification('Erreur', 'Veuillez définir le centre du cercle.', 'warning');
                    return;
                }
                if (geofenceType === 'polygon' && polygonPoints.length < 3) {
                    showNotification('Erreur', 'Veuillez dessiner une zone (min 3 points).', 'warning');
                    return;
                }

                try {
                    const btn = document.getElementById('btnSaveZone');
                    if (btn) { btn.disabled = true; btn.textContent = '⌛...'; }

                    const data = {
                        geofence: {
                            type: geofenceType,
                            isActive: true
                        }
                    };

                    if (geofenceType === 'circle') {
                        data.geofence.lat = geofenceCenter[0];
                        data.geofence.lon = geofenceCenter[1];
                        data.geofence.radius = geofenceRadius;
                    } else {
                        // Map to objects for backend consistency
                        data.geofence.coordinates = polygonPoints.map(p => ({ lat: p[0], lon: p[1] }));
                    }

                    const response = await fetch(`/api/machines/${currentDeviceId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });

                    if (response.ok) {
                        isGeofenceActive = true;
                        isGeofenceAlarmMuted = false;
                        showNotification('Succès', 'Zone enregistrée !', 'success');
                    }
                } catch (err) {
                    showNotification('Erreur', 'Sauvegarde impossible', 'danger');
                } finally {
                    const btn = document.getElementById('btnSaveZone');
                    if (btn) { btn.disabled = false; btn.textContent = '💾 Sauvegarder'; }
                }
            }

            function clearGeofence() {
                geofenceCenter = null;
                polygonPoints = [];
                isGeofenceActive = false;
                if (geofenceCircle) map.removeLayer(geofenceCircle);
                if (geofencePolygon) map.removeLayer(geofencePolygon);
                localStorage.removeItem('geofenceCenter');
                localStorage.removeItem('geofencePolygon');
                showNotification('Zone effacée', 'Prêt pour une nouvelle zone.', 'info');
            }


            // ============================================================
            //  THEME SYSTEM — 4 presets + custom colors
            // ============================================================
            const themes = {
                intellimettry: { accent: '#ff3b30', accentBlue: '#007AFF', accentSuccess: '#34C759', glowAccent: 'rgba(255,59,48,0.6)', glowBlue: 'rgba(0,122,255,0.2)', bgGrad1: 'rgba(255,0,51,0.12)', bgGrad2: 'rgba(0,122,255,0.12)', bgBase1: '#02040a', bgBase2: '#1a0005', bgBase3: '#02040a', bgGlass: 'rgba(20,10,10,0.85)', name: 'IntelliMettry Rouge' },
                blue: { accent: '#007AFF', accentBlue: '#5AC8FA', accentSuccess: '#30D158', glowAccent: 'rgba(0,122,255,0.6)', glowBlue: 'rgba(90,200,250,0.2)', bgGrad1: 'rgba(0,122,255,0.15)', bgGrad2: 'rgba(90,200,250,0.15)', bgBase1: '#00020a', bgBase2: '#001a3a', bgBase3: '#00020a', bgGlass: 'rgba(0,10,30,0.85)', name: 'R-Line Bleu' },
                green: { accent: '#34C759', accentBlue: '#30D158', accentSuccess: '#32D74B', glowAccent: 'rgba(52,199,89,0.6)', glowBlue: 'rgba(48,209,88,0.2)', bgGrad1: 'rgba(52,199,89,0.12)', bgGrad2: 'rgba(0,212,100,0.12)', bgBase1: '#000a02', bgBase2: '#001a08', bgBase3: '#000a02', bgGlass: 'rgba(5,20,10,0.85)', name: 'Eco Vert' },
                orange: { accent: '#ff9500', accentBlue: '#ffb340', accentSuccess: '#34C759', glowAccent: 'rgba(255,149,0,0.6)', glowBlue: 'rgba(255,179,64,0.2)', bgGrad1: 'rgba(255,149,0,0.12)', bgGrad2: 'rgba(255,59,0,0.12)', bgBase1: '#0a0500', bgBase2: '#1a0d00', bgBase3: '#0a0500', bgGlass: 'rgba(25,15,0,0.85)', name: 'Lounge Orange' }
            };

            function hexToRgba(hex, alpha) {
                const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
                return `rgba(${r},${g},${b},${alpha})`;
            }

            function applyThemeFull(theme) {
                const root = document.documentElement;
                root.style.setProperty('--accent-intellimettry', theme.accent);
                root.style.setProperty('--accent-blue', theme.accentBlue);
                root.style.setProperty('--accent-success', theme.accentSuccess);
                root.style.setProperty('--glow-red', theme.glowAccent);
                root.style.setProperty('--bg-glass', theme.bgGlass);
                document.body.style.background = `radial-gradient(circle at 20% 20%, ${theme.bgGrad1} 0%, transparent 40%), radial-gradient(circle at 80% 80%, ${theme.bgGrad2} 0%, transparent 40%), linear-gradient(135deg, ${theme.bgBase1} 0%, ${theme.bgBase2} 50%, ${theme.bgBase3} 100%)`;
                document.body.style.backgroundAttachment = 'fixed';
                const ap = document.getElementById('accentColorPicker');
                const bp = document.getElementById('bgColorPicker');
                if (ap) ap.value = theme.accent;
                if (bp) bp.value = theme.bgBase2;
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.gauge-arc').forEach(a => { a.style.stroke = theme.accent; a.style.filter = `drop-shadow(0 0 8px ${theme.glowAccent})`; });
                const needle = document.getElementById('tachoNeedle');
                if (needle) { needle.style.fill = theme.accent; needle.style.filter = `drop-shadow(0 0 10px ${theme.glowAccent})`; }
                const dot = document.querySelector('.tacho-svg circle');
                if (dot) dot.setAttribute('fill', theme.accent);
                document.querySelectorAll('.tacho-mark-red').forEach(m => m.style.stroke = theme.accent);
                const tg = document.querySelector('.tacho-glow');
                if (tg) tg.style.background = `radial-gradient(circle, ${theme.glowAccent} 0%, transparent 70%)`;
                const cp = document.getElementById('colorPanel');
                if (cp) cp.style.borderColor = theme.accent;
                if (typeof tempChartInstance !== 'undefined' && tempChartInstance) { tempChartInstance.data.datasets[0].borderColor = theme.accent; tempChartInstance.data.datasets[0].backgroundColor = hexToRgba(theme.accent, 0.1); tempChartInstance.update('none'); }
                if (typeof oilChartInstance !== 'undefined' && oilChartInstance) { oilChartInstance.data.datasets[0].borderColor = theme.accentBlue; oilChartInstance.data.datasets[0].backgroundColor = hexToRgba(theme.accentBlue, 0.1); oilChartInstance.update('none'); }
                if (typeof fuelChartInstance !== 'undefined' && fuelChartInstance) { fuelChartInstance.data.datasets[0].borderColor = theme.accentSuccess; fuelChartInstance.data.datasets[0].backgroundColor = hexToRgba(theme.accentSuccess, 0.1); fuelChartInstance.update('none'); }
            }

            function setTheme(themeName) {
                const theme = themes[themeName];
                if (!theme) return;
                applyThemeFull(theme);
                localStorage.setItem('dashboardTheme', themeName);
                localStorage.removeItem('customAccentColor');
                localStorage.removeItem('customBgColor');
                document.querySelectorAll('.theme-btn').forEach(btn => { btn.classList.toggle('active', btn.textContent.trim() === theme.name); });
            }

            function updateCustomColor(type, color) {
                if (type === 'accent') {
                    const glow = hexToRgba(color, 0.6);
                    document.documentElement.style.setProperty('--accent-intellimettry', color);
                    document.documentElement.style.setProperty('--glow-red', glow);
                    document.querySelectorAll('.gauge-arc').forEach(a => { a.style.stroke = color; a.style.filter = `drop-shadow(0 0 8px ${glow})`; });
                    const needle = document.getElementById('tachoNeedle');
                    if (needle) { needle.style.fill = color; needle.style.filter = `drop-shadow(0 0 10px ${glow})`; }
                    document.querySelectorAll('.tacho-mark-red').forEach(m => m.style.stroke = color);
                    const tg = document.querySelector('.tacho-glow');
                    if (tg) tg.style.background = `radial-gradient(circle, ${glow} 0%, transparent 70%)`;
                    if (typeof tempChartInstance !== 'undefined' && tempChartInstance) { tempChartInstance.data.datasets[0].borderColor = color; tempChartInstance.data.datasets[0].backgroundColor = hexToRgba(color, 0.1); tempChartInstance.update('none'); }
                    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                    localStorage.setItem('customAccentColor', color);
                } else if (type === 'bg') {
                    document.body.style.background = `radial-gradient(circle at 20% 20%, ${hexToRgba(color, 0.3)} 0%, transparent 40%), radial-gradient(circle at 80% 80%, rgba(0,212,255,0.1) 0%, transparent 40%), linear-gradient(135deg, #000 0%, ${color} 50%, #000 100%)`;
                    document.body.style.backgroundAttachment = 'fixed';
                    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                    localStorage.setItem('customBgColor', color);
                }
            }

            function toggleSettingsPanel(tab) {
                const p = document.getElementById('colorPanel');
                if (!p) return;
                if (!tab) { p.style.display = 'none'; return; }
                const isOpen = p.style.display !== 'none';
                p.style.display = isOpen ? 'none' : 'block';
            }

            function switchSettingsTab(tab) {
                const tabTheme = document.getElementById('tabMainTheme');
                const tabSource = document.getElementById('tabMainSource');
                const secTheme = document.getElementById('sectionTheme');
                const secSource = document.getElementById('sectionSource');
                [tabTheme, tabSource].forEach(t => t && t.classList.remove('active'));
                [secTheme, secSource].forEach(s => s && (s.style.display = 'none'));
                if (tab === 'source') { if (tabSource) tabSource.classList.add('active'); if (secSource) secSource.style.display = 'block'; }
                else { if (tabTheme) tabTheme.classList.add('active'); if (secTheme) secTheme.style.display = 'block'; }
            }

            function loadSavedTheme() {
                const saved = localStorage.getItem('dashboardTheme') || 'blue';
                const ca = localStorage.getItem('customAccentColor');
                const cb = localStorage.getItem('customBgColor');
                if (saved && themes[saved]) {
                    applyThemeFull(themes[saved]);
                    setTimeout(() => { document.querySelectorAll('.theme-btn').forEach(btn => { btn.classList.toggle('active', btn.textContent.trim() === themes[saved].name); }); }, 100);
                }
                if (ca) updateCustomColor('accent', ca);
                if (cb) updateCustomColor('bg', cb);
            }
            loadSavedTheme();

            // Initial check
            if (!checkAuth()) {
                window.location.href = 'login.html';
            }
        </script>

<script>
        // ─────────────────────────────────────────────────────
        // SIDEBAR — Toggle collapse/expand
        // ─────────────────────────────────────────────────────
        let sidebarCollapsed = false;

        function toggleSidebar() {
            const sidebar = document.getElementById('mainSidebar');
            const content = document.getElementById('pageContent');
            const icon = document.getElementById('sbToggleIcon');

            sidebarCollapsed = !sidebarCollapsed;

            if (sidebarCollapsed) {
                sidebar.classList.add('collapsed');
                content.classList.add('expanded');
                // Point right: ›
                icon.setAttribute('points', '9 18 15 12 9 6');
            } else {
                sidebar.classList.remove('collapsed');
                content.classList.remove('expanded');
                // Point left: ‹
                icon.setAttribute('points', '15 18 9 12 15 6');
            }
        }

        // ─────────────────────────────────────────────────────
        // SIDEBAR CLOCK — Ticking every second
        // ─────────────────────────────────────────────────────
        function updateSidebarClock() {
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');

            const days = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
            const months = ['JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUN', 'JUL', 'AOÛ', 'SEP', 'OCT', 'NOV', 'DÉC'];

            const clockEl = document.getElementById('sbClock');
            const dateEl = document.getElementById('sbDate');
            if (clockEl) clockEl.textContent = `${hh}:${mm}:${ss}`;
            if (dateEl) dateEl.textContent = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
        }
        setInterval(updateSidebarClock, 1000);
        updateSidebarClock();

        // ─────────────────────────────────────────────────────
        // SIDEBAR DATA — Updated from main updateDashboard()
        // ─────────────────────────────────────────────────────

        /**
         * Call this from updateDashboard(data) to sync sidebar.
         * Also hooks into markDeviceOnline / markDeviceOffline.
         */
        function updateSidebar(data) {
            if (!data) return;

            // ── Device status ──
            const sbDot = document.getElementById('sbStatusDot');
            const sbLabel = document.getElementById('sbDeviceLabel');
            const sbId = document.getElementById('sbDeviceId');
            if (sbDot) sbDot.classList.toggle('online', !!(data.engine_on !== undefined));
            if (sbLabel) sbLabel.textContent = data.engine_on !== undefined ? 'EN LIGNE' : 'HORS LIGNE';
            if (sbId) sbId.textContent = (currentDeviceId || '--').toUpperCase();

            // ── Engine & Gear ──
            const sbEngineState = document.getElementById('sbEngineState');
            const sbEngineCard = document.getElementById('sbEngineCard');
            const sbGearBadge = document.getElementById('sbGearBadge');

            const engineOn = !!data.engine_on;
            if (sbEngineState) {
                sbEngineState.textContent = engineOn ? 'MARCHE' : 'ARRÊT';
                sbEngineState.style.color = engineOn ? '#34c759' : 'var(--text-secondary)';
            }
            if (sbEngineCard) {
                sbEngineCard.className = 'sb-metric' + (engineOn ? ' success' : '');
            }
            if (sbGearBadge) {
                const g = data.gear;
                if (g === 1 || g === '1') {
                    sbGearBadge.textContent = 'AV';
                    sbGearBadge.className = 'sb-gear-badge av';
                } else if (g === -1 || g === '-1') {
                    sbGearBadge.textContent = 'AR';
                    sbGearBadge.className = 'sb-gear-badge ar';
                } else {
                    sbGearBadge.textContent = 'N';
                    sbGearBadge.className = 'sb-gear-badge';
                }
            }

            // ── Temperature ──
            const sbTemp = document.getElementById('sbTemp');
            const sbTempSub = document.getElementById('sbTempSub');
            const sbTempCard = document.getElementById('sbTempCard');
            const temp = parseFloat(data.temp);
            const tempNc = !!data.temp_nc;

            if (sbTemp) {
                if (tempNc) {
                    sbTemp.textContent = 'NC';
                    sbTemp.style.color = '#ff3b30';
                } else {
                    sbTemp.textContent = isNaN(temp) ? 'ERR' : temp.toFixed(1) + ' °C';
                    sbTemp.style.color = temp > 95 ? '#ff3b30' : temp > 80 ? '#ffa500' : 'var(--text-primary)';
                }
            }
            if (sbTempSub) {
                sbTempSub.textContent = tempNc ? 'SONDE DÉBRANCHÉE' : (temp > 95 ? '⚠️ SURCHAUFFE' : temp > 80 ? 'Attention' : 'Normal');
            }
            if (sbTempCard) {
                sbTempCard.className = 'sb-metric' + (tempNc || temp > 95 ? ' alert' : temp > 80 ? ' warning' : '');
            }

            // ── Oil Pressure ──
            const sbOil = document.getElementById('sbOil');
            const sbOilSub = document.getElementById('sbOilSub');
            const sbOilCard = document.getElementById('sbOilCard');
            const oil = parseFloat(data.oil_pressure);
            if (sbOil) {
                sbOil.textContent = isNaN(oil) || oil < 0 ? 'ERR' : oil.toFixed(1) + ' Bar';
                sbOil.style.color = (engineOn && oil < 0.5) ? '#ff3b30' : 'var(--text-primary)';
            }
            if (sbOilSub) {
                sbOilSub.textContent = (engineOn && oil < 0.5) ? '⚠️ FAIBLE' : 'Normal';
            }
            if (sbOilCard) {
                sbOilCard.className = 'sb-metric' + (engineOn && oil < 0.5 ? ' alert' : '');
            }

            // ── Engine Hours ──
            const sbHours = document.getElementById('sbHours');
            if (sbHours) {
                let h = parseFloat(data.engine_hours) || 0;
                if (h > 5000) h = h / 3600; // seconds → hours correction
                sbHours.textContent = h.toFixed(2).replace('.', ',') + ' h';
            }

            // ── Fuel ──
            const sbFuel = document.getElementById('sbFuel');
            const sbFuelBar = document.getElementById('sbFuelBar');
            const sbFuelCard = document.getElementById('sbFuelCard');
            const fuel = parseFloat(data.fuel_percent);
            const fuelNc = !!data.fuel_nc;

            if (fuelNc) {
                if (sbFuel) { sbFuel.textContent = 'NC'; sbFuel.style.color = '#ff3b30'; }
                if (sbFuelBar) { sbFuelBar.style.width = '0%'; }
                if (sbFuelCard) { sbFuelCard.className = 'sb-metric alert'; }
            } else if (!isNaN(fuel)) {
                const pct = Math.min(100, Math.max(0, fuel));
                if (sbFuel) {
                    sbFuel.textContent = Math.round(pct) + '%';
                    sbFuel.style.color = pct < 10 ? '#ff3b30' : pct < 25 ? '#ffa500' : 'var(--text-primary)';
                }
                if (sbFuelBar) {
                    sbFuelBar.style.width = pct + '%';
                    sbFuelBar.className = 'sb-fuel-bar-fill' + (pct < 10 ? ' low' : pct < 25 ? ' med' : '');
                }
                if (sbFuelCard) {
                    sbFuelCard.className = 'sb-metric' + (pct < 10 ? ' alert' : pct < 25 ? ' warning' : '');
                }
            }

            // ── GPS ──
            const sbGpsVal = document.getElementById('sbGpsVal');
            const sbSats = document.getElementById('sbSats');
            const sbSpeed = document.getElementById('sbSpeed');
            if (sbGpsVal) {
                const lat = parseFloat(data.lat), lon = parseFloat(data.lon);
                sbGpsVal.textContent = (lat && lon && lat !== 0 && lon !== 0)
                    ? lat.toFixed(4) + ', ' + lon.toFixed(4)
                    : 'Recherche...';
            }
            if (sbSats) sbSats.textContent = (data.sats || 0) + ' satellites';
            if (sbSpeed) sbSpeed.textContent = Math.round(data.speed || 0) + ' km/h';

            // ── Proximity ──
            const sbProxVal = document.getElementById('sbProxVal');
            const sbProxBar = document.getElementById('sbProxBar');
            const sbProxCard = document.getElementById('sbProxCard');
            const prox = parseFloat(data.proximity_cm);
            if (sbProxVal) {
                if (isNaN(prox) || prox < 0) {
                    sbProxVal.textContent = 'Dégagé';
                    sbProxVal.style.color = '#34c759';
                } else {
                    sbProxVal.textContent = Math.round(prox) + ' cm';
                    sbProxVal.style.color = prox <= 80 ? '#ff3b30' : prox <= 150 ? '#ffa500' : '#34c759';
                }
            }
            if (sbProxBar) {
                const proxPct = isNaN(prox) || prox < 0
                    ? 100
                    : Math.max(0, 100 - (prox / 4)); // 400cm = 0%, 0cm = 100%
                sbProxBar.style.width = proxPct + '%';
                sbProxBar.style.background = prox <= 80 ? '#ff3b30' : prox <= 150 ? '#ffa500' : '#34c759';
            }
            if (sbProxCard) {
                sbProxCard.className = 'sb-metric' + (prox >= 0 && prox <= 80 ? ' alert' : prox <= 150 ? ' warning' : '');
            }

            // ── Radar UI in Main Dashboard (Center Widget) ──
            const proxWidget = document.getElementById('proximityWidget');
            const proxDist = document.getElementById('proxDistanceDisplay');
            const proxLabel = document.getElementById('proxZoneLabel');
            const proxArc = document.getElementById('proxArc');

            // Only show radar when gear is -1 (reverse)
            if (data.gear == '-1' || data.gear === -1) {
                if (proxWidget) proxWidget.style.display = 'flex';
                let color = '#34c759'; // green
                let label = 'DÉGAGÉ';
                let value = '--';
                let offset = 0; // 0 = Full arc (100% distance)

                if (isNaN(prox) || prox < 0) {
                    // ERR / NC (<-1)
                    color = '#ff3b30'; // red
                    label = 'ERREUR';
                    value = 'NC';
                    offset = 117; // Empty arc
                } else if (prox >= 0 && prox <= 400) {
                    value = Math.round(prox);
                    // Update Arc offset (0-117). 400cm = 117 (max), 0cm = 0 (min)
                    offset = Math.min(117, Math.max(0, (prox / 400) * 117));

                    if (prox <= 80) {
                        color = '#ff3b30'; // red
                        label = 'DANGER !!';
                    } else if (prox <= 150) {
                        color = '#ffa500'; // orange
                        label = 'ATTENTION';
                    } else {
                        color = '#34c759';
                        label = 'APPROCHE';
                    }
                }


                if (proxDist) { proxDist.textContent = value; proxDist.style.color = color; }
                const proxUnit = document.getElementById('proxUnit');
                if (proxUnit) { proxUnit.style.display = (value === '--') ? 'none' : 'block'; }

                if (proxLabel) {
                    proxLabel.textContent = label;
                    proxLabel.className = 'prox-zone-label ' + (prox <= 80 ? 'danger' : prox <= 150 ? 'caution' : 'clear');
                }
                if (proxArc) {
                    proxArc.style.stroke = color;
                    proxArc.style.strokeDashoffset = offset;
                }
            } else {
                if (proxWidget) proxWidget.style.display = 'none';
            }

            // ── Session ──
            const sbStart = document.getElementById('sbStartTime');
            const sbCons = document.getElementById('sbConsumption');
            if (sbStart) {
                sbStart.textContent = (engineStartTime && data.engine_on)
                    ? formatTime(engineStartTime)
                    : '--:--';
            }
            if (sbCons) {
                sbCons.textContent = (totalFuelConsumed || 0).toFixed(1).replace('.', ',') + ' L';
            }

            // ── Online status dot sync ──
            if (sbDot) sbDot.classList.add('online');
            if (sbLabel) sbLabel.textContent = 'EN LIGNE';
        }

        // ─────────────────────────────────────────────────────
        // Hook into the existing updateDashboard function
        // ─────────────────────────────────────────────────────
        const _originalUpdateDashboard = (typeof updateDashboard === 'function') ? updateDashboard : null;

        // Patch: wrap the existing updateDashboard to also call updateSidebar
        document.addEventListener('DOMContentLoaded', () => {
            // The original function is defined above in the first <script>.
            // We patch it after DOM is ready so both scripts are loaded.
            const origFn = window.updateDashboard;
            if (origFn) {
                window.updateDashboard = function (data) {
                    origFn.call(this, data);
                    updateSidebar(data);
                };
            }

            // Device ID init
            const sbId = document.getElementById('sbDeviceId');
            if (sbId) sbId.textContent = (currentDeviceId || 'truck_01').toUpperCase();
        });
    </script>

<script src="nav.js"></script>

