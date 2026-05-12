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
        if (/password authentication failed/i.test(String(error.message || ''))) {
            console.error('Hint: check DATABASE_URL in backend/.env.');
            console.error('Expected localhost format: postgresql://cie_user:<your_password>@localhost:5432/cie_reservation');
            console.error('If needed, reset PostgreSQL password:');
            console.error(`  sudo -u postgres psql -c "ALTER ROLE cie_user WITH PASSWORD '<your_password>';"`);
        }
        process.exit(1);
    });
