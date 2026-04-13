const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const URI = process.env.MONGODB_URI;
const DB_NAME = 'oldTruck';
const EXPORT_DIR = path.join(__dirname, '..', 'exports');

async function exportDatabase() {
    console.log(' Démarrage de l\'exportation...');
    const client = new MongoClient(URI);

    try {
        if (!fs.existsSync(EXPORT_DIR)) {
            fs.mkdirSync(EXPORT_DIR);
            console.log(` Dossier créé : ${EXPORT_DIR}`);
        }

        await client.connect();
        console.log(' Connecté à MongoDB Atlas.');

        const db = client.db(DB_NAME);
        const collections = await db.listCollections().toArray();
        console.log(` ${collections.length} collections à exporter.`);

        for (const colDef of collections) {
            const colName = colDef.name;
            console.log(` Exportation de ${colName}...`);

            const documents = await db.collection(colName).find({}).toArray();
            const filePath = path.join(EXPORT_DIR, `${colName}.json`);

            fs.writeFileSync(filePath, JSON.stringify(documents, null, 2));
            console.log(` ${colName} exporté vers ${path.basename(filePath)} (${documents.length} docs).`);
        }

        console.log('\n Exportation terminée avec succès !');
        console.log(` Les fichiers sont dans : ${EXPORT_DIR}`);

    } catch (err) {
        console.error('\n Erreur lors de l\'exportation :', err.message);
    } finally {
        await client.close();
    }
}

exportDatabase();
