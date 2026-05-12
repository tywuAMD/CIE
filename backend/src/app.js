const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { AppError } = require('./utils/errors');
const { requireAuth } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const platformsRouter = require('./routes/platforms');
const availabilityRouter = require('./routes/availability');
const reservationsRouter = require('./routes/reservations');
const workspacesRouter = require('./routes/workspaces');

const app = express();

app.use(
    cors({
        origin: config.corsOrigin === '*'
            ? true
            : config.corsOrigin.split(',').map((origin) => origin.trim()),
        credentials: true
    })
);
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api', requireAuth);
app.use('/api/platforms', platformsRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/reservations', reservationsRouter);
app.use('/api/workspaces', workspacesRouter);

app.use((_req, _res, next) => {
    next(new AppError(404, 'Route not found.'));
});

app.use((error, _req, res, _next) => {
    if (error instanceof AppError) {
        return res.status(error.statusCode).json({
            error: error.message,
            details: error.details
        });
    }

    if (error.code === '22P02') {
        return res.status(400).json({ error: 'Invalid identifier format.' });
    }

    console.error('Unhandled backend error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
});

module.exports = app;
