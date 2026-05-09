const { Pool } = require('pg');
const config = require('./config');

let pool;

function getPool() {
    if (!config.databaseUrl) {
        throw new Error('DATABASE_URL is not configured. Create backend/.env before starting the API.');
    }

    if (!pool) {
        const useSsl = config.nodeEnv === 'production';
        pool = new Pool({
            connectionString: config.databaseUrl,
            ssl: useSsl ? { rejectUnauthorized: false } : false
        });

        pool.on('error', (error) => {
            console.error('Unexpected PostgreSQL pool error:', error);
        });
    }

    return pool;
}

async function query(text, params = []) {
    return getPool().query(text, params);
}

async function getClient() {
    return getPool().connect();
}

module.exports = {
    query,
    getClient
};
