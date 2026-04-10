/**
 * INTELLIMETTRY — AI Diagnostic Service
 * Uses Google Gemini 2.0 Flash to analyze telemetry data
 * and provide intelligent diagnostics when alerts occur.
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// In-memory cooldown to avoid spamming the AI API
const _aiCooldowns = {};
const AI_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes per device

/**
 * Analyzes truck telemetry data with Gemini AI and returns a diagnostic.
 * @param {string} deviceId - The truck ID
 * @param {object} data - The telemetry payload from the ESP32
 * @param {string} alertReason - Why the AI was triggered (e.g., "LOW_OIL_PRESSURE")
 * @returns {Promise<string|null>} AI diagnostic text, or null if unavailable
 */
async function analyzeTelemetry(deviceId, data, alertReason) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('[AI] GEMINI_API_KEY not set in .env — AI diagnostic skipped');
        return null;
    }

    // Cooldown per device to avoid excessive API calls
    const now = Date.now();
    if (_aiCooldowns[deviceId] && (now - _aiCooldowns[deviceId]) < AI_COOLDOWN_MS) {
        console.log(`[AI] Cooldown active for ${deviceId} — skipping`);
        return null;
    }
    _aiCooldowns[deviceId] = now;

    const prompt = `Tu es un expert en maintenance de chariots élévateurs industriels. 
Analyse les données suivantes reçues d'un chariot connecté (ID: ${deviceId}) et donne un diagnostic court et professionnel.

Raison de l'alerte: ${alertReason}

Données capteurs:
- Température moteur: ${data.temp !== null && data.temp !== undefined ? data.temp + '°C' : 'NC (capteur déconnecté)'}
- Pression huile: ${data.oil_pressure !== null && data.oil_pressure !== undefined ? data.oil_pressure + ' Bar' : 'NC'}
- Carburant: ${data.fuel_liters !== null ? data.fuel_liters + ' L' : 'NC'} (${data.fuel_percent !== null ? data.fuel_percent + '%' : 'NC'})
- RPM: ${data.rpm || 0}
- Vitesse: ${data.speed || 0} km/h
- Heures moteur: ${data.engine_hours ? (data.engine_hours).toFixed(1) + 'h' : '--'}
- Moteur en marche: ${(data.engine_on === true || data.engine_on === 'true') ? 'OUI' : 'NON'}

Réponds en français, en 2-3 phrases maximum. Indique:
1. Le problème probable
2. L'action immédiate recommandée
Sois direct et professionnel.`;

    try {
        console.log(`[AI] Analyzing telemetry for ${deviceId} (reason: ${alertReason})...`);
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 200
                }
            }),
            signal: AbortSignal.timeout(8000) // 8s timeout
        });

        if (!response.ok) {
            const err = await response.text();
            console.error(`[AI] Gemini API error: ${response.status} — ${err}`);
            return null;
        }

        const result = await response.json();
        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (text) {
            console.log(`[AI] ✓ Diagnostic for ${deviceId}: ${text.slice(0, 100)}...`);
            return text.trim();
        }
        return null;
    } catch (err) {
        console.error(`[AI] Request failed: ${err.message}`);
        return null;
    }
}

module.exports = { analyzeTelemetry };
