const mongoose = require('mongoose');

const MAX_RETRIES = 10;          // Nombre de tentatives max
const RETRY_DELAY_MS = 3000;     // Délai entre tentatives (3s)

const connectDB = async (uri, attempt = 1) => {
    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,   // Abandon la sélection serveur après 5s
            connectTimeoutMS: 10000,           // Timeout connexion TCP
            socketTimeoutMS: 45000,            // Timeout socket opérations
        });
        console.log('✅ Connecté à MongoDB');

        // Écouter les événements de déconnexion pour auto-reconnect
        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️  MongoDB déconnecté. Tentative de reconnexion...');
            setTimeout(() => connectDB(uri), RETRY_DELAY_MS);
        });

        mongoose.connection.on('error', (err) => {
            console.error('❌ Erreur MongoDB:', err.message);
        });

    } catch (err) {
        console.error(`❌ Connexion MongoDB échouée (tentative ${attempt}/${MAX_RETRIES}): ${err.message}`);

        if (attempt < MAX_RETRIES) {
            const delay = Math.min(RETRY_DELAY_MS * attempt, 30000); // Backoff max 30s
            console.log(`🔄 Nouvelle tentative dans ${delay / 1000}s...`);
            setTimeout(() => connectDB(uri, attempt + 1), delay);
        } else {
            console.error('❌ MongoDB inaccessible après toutes les tentatives. Le backend continue sans DB.');
            console.error('💡 Vérifiez que MongoDB est lancé: docker-compose up -d mongodb');
        }
        // Ne pas crasher le serveur — il reste opérationnel sans DB
    }
};

module.exports = connectDB;

