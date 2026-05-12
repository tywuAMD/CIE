const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { AppError } = require('../utils/errors');

function normalizeText(value) {
    return String(value || '').trim();
}

function hashSessionToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function sanitizeUser(row) {
    return {
        id: row.id,
        username: row.username,
        email: row.email || null,
        role: row.role
    };
}

function sessionDurationMs() {
    const hours = Number(config.sessionTtlHours);
    const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 12;
    return safeHours * 60 * 60 * 1000;
}

function cookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.nodeEnv === 'production',
        path: '/',
        maxAge: sessionDurationMs()
    };
}

function validatePasswordPolicy(password, fieldName = 'password') {
    if (!password) {
        throw new AppError(400, `"${fieldName}" is required.`);
    }

    if (password.length < 8) {
        throw new AppError(400, `${fieldName} must be at least 8 characters.`);
    }

    if (password.length > 128) {
        throw new AppError(400, `${fieldName} must be 128 characters or fewer.`);
    }
}

function validateResetPasswordInput(username, currentPassword, newPassword) {
    if (!username || !currentPassword || !newPassword) {
        throw new AppError(400, '"username", "currentPassword", and "newPassword" are required.');
    }

    validatePasswordPolicy(newPassword, 'newPassword');

    if (currentPassword === newPassword) {
        throw new AppError(400, 'New password must be different from current password.');
    }
}

async function createSessionForTeam(teamId) {
    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = hashSessionToken(rawSessionToken);
    const expiresAt = new Date(Date.now() + sessionDurationMs());

    await db.query(
        `INSERT INTO sessions (team_id, session_token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [teamId, sessionTokenHash, expiresAt.toISOString()]
    );

    return rawSessionToken;
}

async function login(username, password) {
    const normalizedUsername = normalizeText(username);
    const normalizedPassword = String(password || '');

    if (!normalizedUsername || !normalizedPassword) {
        throw new AppError(400, '"username" and "password" are required.');
    }

    const teamResult = await db.query(
        `SELECT id, username, email, role
         FROM teams
         WHERE username = $1
           AND is_active = TRUE
           AND password_hash = crypt($2, password_hash)`,
        [normalizedUsername, normalizedPassword]
    );

    if (teamResult.rowCount === 0) {
        throw new AppError(401, 'Invalid username or password.');
    }

    const team = teamResult.rows[0];
    const rawSessionToken = await createSessionForTeam(team.id);

    return {
        sessionToken: rawSessionToken,
        user: sanitizeUser(team)
    };
}

async function resetPassword(username, currentPassword, newPassword) {
    const normalizedUsername = normalizeText(username);
    const normalizedCurrentPassword = String(currentPassword || '');
    const normalizedNewPassword = String(newPassword || '');

    validateResetPasswordInput(normalizedUsername, normalizedCurrentPassword, normalizedNewPassword);

    const updateResult = await db.query(
        `UPDATE teams
         SET password_hash = crypt($3, gen_salt('bf'))
         WHERE username = $1
           AND is_active = TRUE
           AND password_hash = crypt($2, password_hash)
         RETURNING id`,
        [normalizedUsername, normalizedCurrentPassword, normalizedNewPassword]
    );

    if (updateResult.rowCount === 0) {
        throw new AppError(401, 'Invalid username or current password.');
    }

    await db.query(
        `DELETE FROM sessions
         WHERE team_id = $1`,
        [updateResult.rows[0].id]
    );
}

async function getUserBySessionToken(sessionToken) {
    const token = normalizeText(sessionToken);
    if (!token) return null;

    const tokenHash = hashSessionToken(token);

    const result = await db.query(
        `SELECT t.id, t.username, t.email, t.role
         FROM sessions s
         JOIN teams t ON t.id = s.team_id
         WHERE s.session_token_hash = $1
           AND s.expires_at > NOW()
           AND t.is_active = TRUE`,
        [tokenHash]
    );

    if (result.rowCount === 0) {
        return null;
    }

    return sanitizeUser(result.rows[0]);
}

async function logout(sessionToken) {
    const token = normalizeText(sessionToken);
    if (!token) return;

    const tokenHash = hashSessionToken(token);
    await db.query(
        `DELETE FROM sessions
         WHERE session_token_hash = $1`,
        [tokenHash]
    );
}

module.exports = {
    login,
    resetPassword,
    logout,
    getUserBySessionToken,
    cookieOptions
};
