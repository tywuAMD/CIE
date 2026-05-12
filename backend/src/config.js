const dotenv = require('dotenv');

dotenv.config({ quiet: true });

function parseNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseNumber(process.env.PORT, 4000),
    databaseUrl: process.env.DATABASE_URL || '',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    sessionTtlHours: parseNumber(process.env.SESSION_TTL_HOURS, 12),
    sessionCookieName: process.env.SESSION_COOKIE_NAME || 'cie_session',
    oneClickBaseUrl: process.env.ONECLICK_BASE_URL || 'http://localhost:8000',
    oneClickBridgeToken: process.env.ONECLICK_BRIDGE_TOKEN || '',
    oneClickTimeoutMs: parseNumber(process.env.ONECLICK_TIMEOUT_MS, 15000)
};

module.exports = config;
