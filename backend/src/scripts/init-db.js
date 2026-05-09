const fs = require('fs/promises');
const path = require('path');
const db = require('../db');

async function initDb() {
    const schemaPath = path.resolve(__dirname, '../../db/schema.sql');
    const sql = await fs.readFile(schemaPath, 'utf8');
    const client = await db.getClient();

    try {
        await client.query(sql);
        console.log('Database schema initialized successfully.');
    } finally {
        client.release();
    }
}

initDb()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Failed to initialize database schema:', error.message);
        process.exit(1);
    });
