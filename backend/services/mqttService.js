const Telemetry = require('../models/Telemetry');
const Notification = require('../models/Notification');
const Machine = require('../models/Machine');
const { analyzeTelemetry } = require('./aiService');

// In-memory timers for persistent alerts (Thresholds and Wiring)
const faultTimers = {};

const createNotification = async (deviceId, title, message, type, force = false) => {
    try {
        const machine = await Machine.findOne({ deviceId });
        const ownerId = machine ? machine.ownerId : null;

        // Cooldown: prevent repetitive spamming
        if (!force) {
            const cooldown = (type === 'danger') ? 10 * 60 * 1000 : 2 * 60 * 1000;
            const lastNotif = await Notification.findOne({ deviceId, title, ownerId }).sort({ timestamp: -1 });
            const now = new Date();
            if (lastNotif && (now - lastNotif.timestamp < cooldown)) return;
        }

        const notif = new Notification({ deviceId, ownerId, title, message, type });
        await notif.save();
        console.log(`🔔 Notif [${deviceId}]: ${title}`);
    } catch (err) {
        console.error('❌ Notification Error:', err.message);
    }
};

let mqttClient = null;

const initMQTTService = (client, topic) => {
    mqttClient = client;
    client.subscribe(topic);

    client.on('message', async (topic, message) => {
        try {
            const data = JSON.parse(message.toString());
            const deviceId = data.deviceId || data.mac || 'default_truck';

            // --- 🛡️ Helper for Boolean from String ---
            const isTrue = (val) => val === true || val === 'true' || val === 1 || val === '1';

            // --- 🛡️ Helper for GPS Haversine Distance (km) ---
            const getDistance = (lat1, lon1, lat2, lon2) => {
                if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
                const R = 6371; // Rayon de la terre (km)
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLon = (lon2 - lon1) * Math.PI / 180;
                const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
                return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            };

            // 1. Retrieve Machine to Process Trip Logic
            const m = await Machine.findOne({ deviceId });
            const mInfo = m ? `${m.name} (${m.model})` : deviceId;
            let currentTrip = null;

            if (m) {
                // Determine engine state firmly by Oil Pressure (> 0.5 means ON)
                const oilP = Number(data.oil_pressure);
                const isEngineRunning = (!isNaN(oilP) && oilP > 0.5);
                const fuelLitersValid = data.fuel_liters !== null && data.fuel_liters !== undefined && Number(data.fuel_liters) > 0;
                const currentFuel = fuelLitersValid ? Number(data.fuel_liters) : (m.lastFuelLiters || 0);

                // Initialize trip if missing
                currentTrip = m.trip || {
                    isRunning: false, startTime: null, startFuel: 0, fuelConsumed: 0, mileage: 0, lastCalcTime: null
                };

                // FIX: If the machine was offline, force end the previous trip so a new one can start!
                if (m.status === 'offline' && currentTrip.isRunning) {
                    console.log(`[TRIP] Machine was offline, forcing trip restart for ${deviceId}`);
                    currentTrip.isRunning = false;
                }

                const now = new Date();

                if (isEngineRunning && !currentTrip.isRunning) {
                    // Engine just started
                    currentTrip.isRunning = true;
                    currentTrip.startTime = currentTrip.startTime || now;
                    currentTrip.startFuel = currentTrip.startFuel || currentFuel;
                    currentTrip.fuelConsumed = currentTrip.fuelConsumed || 0;
                    currentTrip.lastFuelLevel = currentFuel;
                    // Note: mileage is intentionally NOT reset here, acts as a global/lifetime odometer
                    currentTrip.lastLat = (data.lat && data.lat !== 0) ? data.lat : null;
                    currentTrip.lastLon = (data.lon && data.lon !== 0) ? data.lon : null;
                    currentTrip.lastCalcTime = now;
                } else if (!isEngineRunning && currentTrip.isRunning) {
                    // Engine just stopped
                    currentTrip.isRunning = false;
                    currentTrip.lastCalcTime = now;
                }

                // If running, accumulate distance and fuel consumption
                if (currentTrip.isRunning && currentTrip.lastCalcTime) {
                    // Smart Fuel Consumption Calculation (Accumulator)
                    // We only accumulate small, realistic drops to filter out liquid sloshing and hills.
                    // A truck uses max ~60L/h, so max 1L/min. Any sudden drop > 1.5L in one tick is ignored as slosh/noise.
                    if (currentTrip.lastFuelLevel && currentFuel > 0) {
                        const drop = currentTrip.lastFuelLevel - currentFuel;
                        if (drop > 0 && drop < 1.5) {
                            currentTrip.fuelConsumed = (currentTrip.fuelConsumed || 0) + drop;
                        }
                    }
                    currentTrip.lastFuelLevel = currentFuel;

                    // GPS Mileage Calculation (Distance tracking, purely physical points irrespective of transmitted speed)
                    if (data.lat && data.lon && data.lat !== 0 && data.lon !== 0) {
                        if (currentTrip.lastLat && currentTrip.lastLon) {
                            const dist = getDistance(currentTrip.lastLat, currentTrip.lastLon, data.lat, data.lon);
                            if (dist > 0.005) { // Threshold > 5 meters to prevent static GPS drift accumulation
                                // Use the persistent odometer from the machine
                                m.odometer = (m.odometer || 0) + dist;
                                currentTrip.mileage = m.odometer; 
                                currentTrip.lastLat = data.lat;
                                currentTrip.lastLon = data.lon;
                            }
                        } else {
                            // First valid map point of the session
                            currentTrip.lastLat = data.lat;
                            currentTrip.lastLon = data.lon;
                        }
                    }

                    currentTrip.lastCalcTime = now;
                }

                data.trip = currentTrip; // Inject into telemetry
            }

            // 2. Save Telemetry with injected Trip Data
            const nt = new Telemetry({ ...data, odometer: m ? (m.odometer || 0) : 0, deviceId });
            await nt.save();

            // 3. Log Detailed Heartbeat
            const gearStr = data.gear === 1 ? 'AV' : (data.gear === -1 ? 'AR' : 'N');
            console.log(`📡 [${new Date().toLocaleTimeString()}] MQTT [${topic}]:`);
            console.log(`   🌡️ Temp: ${data.temp}°C | 🛢️ Huile: ${data.oil_pressure} Bar | ⛽ Fuel: ${data.fuel_percent}% | ⚙️ Gear: ${gearStr} | 🔄 RPM: ${data.rpm} | ✅ Engine: ${data.engine_on} | ⏱️ Heures: ${data.engine_hours}h | 📍 Radar: ${data.proximity_cm !== undefined ? data.proximity_cm + 'cm' : '--'}`);

            // 4. Process Machine Alert Logic
            if (m) {
                const oldHealth = m.health || {};
                const oldLiters = m.lastFuelLiters || 0;

                // --- 🛡️ Global Alert Filtering (Block if Sensor is NC) ---
                // data.alert can be a non-empty string like "LOW_OIL_PRESSURE" — check for any truthy value
                if (data.alert && typeof data.alert === 'string' && data.alert.length > 0) {
                    const alertStr = data.alert.toLowerCase();
                    const msgStr = (data.message || "").toLowerCase();

                    // Identify if the alert pertains to a specific sensor
                    const isFuelRelated = alertStr.includes('vol') || alertStr.includes('theft') || alertStr.includes('fuel') || alertStr.includes('carburant') || msgStr.includes('fuel') || msgStr.includes('carburant');
                    const isTempRelated = alertStr.includes('temp') || alertStr.includes('surchauffe') || alertStr.includes('overheat') || msgStr.includes('temp');
                    const isOilRelated = alertStr.includes('oil') || alertStr.includes('huile') || alertStr.includes('pression') || alertStr.includes('pressure') || alertStr.includes('low_oil') || msgStr.includes('oil') || msgStr.includes('huile');

                    // Check if the related sensor is currently disconnected (NC)
                    const isBlocked = (isFuelRelated && isTrue(data.fuel_nc)) ||
                        (isTempRelated && isTrue(data.temp_nc)) ||
                        (isOilRelated && isTrue(data.oil_nc));

                    if (isBlocked) {
                        console.log(`🚨\n🛡️ Alerte Ignorée (${data.alert})\n${mInfo}\nRaison: Capteur déconnecté (NC)\n`);
                    } else {
                        console.log(`🚨 ALERTE: ${data.alert} - ${data.message}`);

                        // 🤖 Ask Gemini AI for a diagnostic (async, non-blocking)
                        analyzeTelemetry(deviceId, data, data.alert)
                            .then(async (diagnosis) => {
                                const finalMessage = diagnosis
                                    ? `${data.message}\n\n🤖 Diagnostic IA: ${diagnosis}`
                                    : data.message;
                                await createNotification(deviceId, `🚨 ${data.alert}`, finalMessage, 'danger', true);
                            })
                            .catch(async () => {
                                // If AI fails, save the notification without diagnosis
                                await createNotification(deviceId, `🚨 ${data.alert}`, data.message, 'danger', true);
                            });
                    }
                }

                // --- 🔌 Wiring/Sensor Faults (Immediate + 10min Reminders) ---
                const handleWiringFault = async (sensorKey, label, currentNC, currentValue) => {
                    if (currentNC === undefined) return;

                    const previousNC = oldHealth[`${sensorKey}_nc`] || false;
                    const isNc = !!currentNC;
                    const timerKey = `${sensorKey}_nc`;

                    if (!faultTimers[deviceId]) faultTimers[deviceId] = {};
                    if (!faultTimers[deviceId][timerKey]) faultTimers[deviceId][timerKey] = { lastNotifTime: null };
                    const timer = faultTimers[deviceId][timerKey];

                    if (isNc) {
                        const now = new Date();
                        // 1. Initial notification
                        if (!previousNC || !timer.lastNotifTime) {
                            console.log(`🚨\n🔌 ${label} Déconnecté\n${mInfo}\nAction: Vérifier câblage\n🕐 INITIAL\n`);
                            await createNotification(deviceId, `🔌 ${label} Déconnecté`, `Problème de câblage ou capteur ${label} (NC)`, 'danger', true);
                            timer.lastNotifTime = now;
                        }
                        // 2. Reminder every 10 minutes
                        else {
                            const minutesSinceLast = Math.floor((now - timer.lastNotifTime) / 60000);
                            if (minutesSinceLast >= 10) {
                                console.log(`🔔\n[RAPPEL] ${label} Déconnecté\n${mInfo}\nAction: Toujours débranché\n🕐 ${minutesSinceLast}min\n`);
                                await createNotification(deviceId, `🔔 [RAPPEL] ${label} Déconnecté`, `Le capteur ${label} est toujours débranché depuis ${minutesSinceLast} minutes.`, 'danger', true);
                                timer.lastNotifTime = now;
                            } else {
                                // Silent log for persistence
                                if (now.getSeconds() % 30 === 0) { // Every 30s to avoid spamming console too fast
                                    console.log(`🔄 [${sensorKey}] Toujours NC (${minutesSinceLast}min)`);
                                }
                            }
                        }
                    } else if (previousNC) {
                        // ROBUST CHECK: Only declare 'Connected' if we have a valid value too
                        const isValidValue = (currentValue !== null && currentValue !== undefined && !isNaN(parseFloat(currentValue)));

                        if (isValidValue) {
                            await createNotification(deviceId, `✔️ ${label} Connecté`, `Capteur ${label} rétabli et opérationnel.`, 'success', true);
                            console.log(`✔️\n🔌 ${label} Connecté\n${mInfo}\nStatut: Rétabli\n`);
                            timer.lastNotifTime = null; // Clear timer
                        }
                    }
                };

                await handleWiringFault('temp', 'Température', data.temp_nc, data.temp);
                await handleWiringFault('oil', 'Huile', data.oil_nc, data.oil_pressure);
                await handleWiringFault('fuel', 'Carburant', data.fuel_nc, data.fuel_percent);

                // --- ⚠️ Operational Thresholds (Instant Recording) ---
                const handleThresholdAlert = async (typeKey, label, isBreach, details, type, currentVal, unit = '') => {
                    // Determine the NC key: 'oil' -> 'oil_nc', 'fuel' -> 'fuel_nc', 'temp' -> 'temp_nc'
                    const sensorPrefix = typeKey.split('_')[0];
                    const isNc = isTrue(data[`${sensorPrefix}_nc`]);
                    if (isNc) return; // Block thresholds if NC

                    if (!faultTimers[deviceId]) faultTimers[deviceId] = {};
                    if (!faultTimers[deviceId][typeKey]) faultTimers[deviceId][typeKey] = { startTime: null, sent: false };
                    const timer = faultTimers[deviceId][typeKey];

                    if (isBreach) {
                        if (!timer.startTime) timer.startTime = new Date();
                        const minutesElapsed = Math.floor((new Date() - timer.startTime) / 60000);
                        const valStr = (currentVal === null || currentVal === undefined || isNaN(currentVal))
                            ? 'Valeur inconnue'
                            : `${Number(currentVal).toFixed(1)}${unit}`;
                        console.log(`⚠️\n${label}\n${mInfo}\n${valStr}\n🕐 ${minutesElapsed}min\n`);

                        if (!timer.sent && minutesElapsed >= 0) {
                            await createNotification(deviceId, label, details, type, true);
                            timer.sent = true;
                        }
                    } else if (timer.startTime) {
                        if (timer.sent) {
                            await createNotification(deviceId, `✔️ ${label} OK`, `Le paramètre est revenu à la normale.`, 'success', true);
                        }
                        timer.startTime = null;
                        timer.sent = false;
                        console.log(`✅\n${label} OK\n${mInfo}\nStatut: Normalisé\n`);
                    }
                };

                const oilP = Number(data.oil_pressure);
                const isEngineRunning = isTrue(data.engine_on);
                const oilPSafe = isNaN(oilP) ? 0 : oilP;
                await handleThresholdAlert('oil', '🚨 LOW_OIL_PRESSURE', (!isNaN(oilP) && oilP < 0.5), `Oil pressure too low for current RPM`, 'danger', oilP, ' Bar');
                await handleThresholdAlert('temp', '⚠️ Surchauffe Moteur', (data.temp > 95), `Température: ${data.temp}°C — Dépassement seuil`, 'danger', data.temp, '°C');
                await handleThresholdAlert('fuel', '⛽ Réserve Carburant', (data.fuel_percent !== null && data.fuel_percent < 15), `Niveau: ${data.fuel_percent}% restant`, 'warning', data.fuel_percent, '%');

                // --- 📍 Proximity / Distance Alert Recording ---
                const prox = parseFloat(data.proximity_cm);
                const isReverse = (data.gear == -1 || data.gear == '-1' || Number(data.gear) === -1);
                if (!isNaN(prox) && prox > 0 && prox <= 80 && isReverse) {
                    // Logic for one notification every 30 seconds for proximity
                    if (!faultTimers[deviceId]) faultTimers[deviceId] = {};
                    if (!faultTimers[deviceId].proximity) faultTimers[deviceId].proximity = { lastTime: 0 };
                    const nowTS = Date.now();
                    if (nowTS - faultTimers[deviceId].proximity.lastTime > 30000) {
                        console.log(`📍\nObstacle Détecté\n${mInfo}\nDistance: ${prox}cm\n`);
                        await createNotification(deviceId, '📍 Obstacle Détecté', `Aproximité critique: ${prox}cm en marche arrière.`, 'danger', false);
                        faultTimers[deviceId].proximity.lastTime = nowTS;
                    }
                }

                // --- ⛽ Backend Fuel Theft Detection ---
                // Guard: fuel_liters must be a valid positive value (NC sends 0/null)
                const fuelLitersValid = data.fuel_liters !== null && data.fuel_liters !== undefined && Number(data.fuel_liters) > 0;
                if (fuelLitersValid && oldLiters > 5 && Number(data.fuel_liters) < oldLiters - 2.0 && !isTrue(data.fuel_nc) && !isTrue(oldHealth.fuel_nc)) {
                    const drop = oldLiters - Number(data.fuel_liters);
                    if (drop < 50.0) { // sanity cap — ignore unrealistic drops
                        console.log(`‼️\nVOL DE GASOIL DÉTECTÉ\n${mInfo}\nBaisse: ${drop.toFixed(1)}L\n`);
                        await createNotification(deviceId, '‼️ VOL DE GASOIL !', `Baisse rapide de ${drop.toFixed(1)}L détectée !`, 'danger', true);
                    }
                }

                // --- 📍 Geofencing Monitoring ---
                if (m.geofence && m.geofence.isActive && m.geofence.lat && m.geofence.lon && data.lat && data.lon) {
                    const distance = getDistance(m.geofence.lat, m.geofence.lon, data.lat, data.lon) * 1000; // Convert to meters
                    const deviceId = m.deviceId;

                    if (distance > m.geofence.radius) {
                        // Truck is OUTSIDE the zone
                        if (!faultTimers[deviceId]) faultTimers[deviceId] = {};
                        if (!faultTimers[deviceId].geofence) faultTimers[deviceId].geofence = { lastAlarmTime: 0 };
                        
                        const nowTS = Date.now();
                        // Trigger alarm every 30 seconds while outside
                        if (nowTS - faultTimers[deviceId].geofence.lastAlarmTime > 30000) {
                            console.log(`🚨 [GEOFENCE] Breach! Distance: ${distance.toFixed(1)}m (Radius: ${m.geofence.radius}m)`);
                            
                            // Send physical alarm command to ESP32
                            publishCommand(`feeds/truck-commands`, { command: 'TRIGGER_ALARM', state: 'on' });
                            
                            // Create notification
                            await createNotification(deviceId, '🚨 Sortie de Zone', `Le chariot est à ${distance.toFixed(0)}m de son centre (Rayon: ${m.geofence.radius}m).`, 'danger', true);
                            
                            faultTimers[deviceId].geofence.lastAlarmTime = nowTS;
                        }
                    } else if (faultTimers[deviceId] && faultTimers[deviceId].geofence && faultTimers[deviceId].geofence.lastAlarmTime > 0) {
                        // Truck returned INSIDE the zone
                        console.log(`✔️ [GEOFENCE] Returned to safe zone.`);
                        publishCommand(`feeds/truck-commands`, { command: 'TRIGGER_ALARM', state: 'off' });
                        await createNotification(deviceId, '✔️ Retour en Zone', `Le chariot est revenu dans sa zone de sécurité.`, 'success', true);
                        faultTimers[deviceId].geofence.lastAlarmTime = 0; // Reset
                    }
                }

                // 4. Update Machine Health
                const updatePayload = {
                    status: 'online',
                    lastSeen: new Date(),
                    $set: {
                        'health.temp_nc': isTrue(data.temp_nc),
                        'health.oil_nc': isTrue(data.oil_nc),
                        'health.fuel_nc': isTrue(data.fuel_nc),
                        'health.temp': (data.temp > 95 && !isTrue(data.temp_nc)) ? 'danger' : 'ok',
                        'trip': currentTrip,
                        'odometer': m.odometer || currentTrip.mileage || 0
                    }
                };
                // Only preserve lastFuelLiters when sensor is connected and reading is valid
                if (fuelLitersValid && !isTrue(data.fuel_nc)) {
                    updatePayload.lastFuelLiters = Number(data.fuel_liters);
                }
                updatePayload.$set['health.oil'] = (oilP < 0.5 && !isTrue(data.oil_nc)) ? 'danger' : 'ok';

                await Machine.findOneAndUpdate({ deviceId }, updatePayload);
            }
        } catch (err) {
            console.error('❌ MQTT Processing Error:', err.message);
        }
    });

    setInterval(async () => {
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        await Machine.updateMany({ lastSeen: { $lt: twoMinutesAgo }, status: 'online' }, { status: 'offline' });
    }, 60000);
};

const publishCommand = (topic, message) => {
    if (mqttClient && mqttClient.connected) {
        // If message is already a string (JSON stringified), publish it directly
        const payload = (typeof message === 'string') ? message : JSON.stringify(message);
        mqttClient.publish(topic, payload);
        return true;
    }
    return false;
};

module.exports = { initMQTTService, publishCommand };
