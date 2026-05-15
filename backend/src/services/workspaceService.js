const db = require('../db');
const config = require('../config');
const { AppError } = require('../utils/errors');
const reservationService = require('./reservationService');

function normalizeText(value) {
    return String(value || '').trim();
}

function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        normalizeText(value)
    );
}

function normalizeReservationId(value) {
    const normalized = normalizeText(value);
    return isUuid(normalized) ? normalized : '';
}

function isValidNotebookEmail(value) {
    const normalized = normalizeText(value).toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function formatOneClickErrorDetail(detail) {
    if (Array.isArray(detail)) {
        const messages = detail
            .map((item) => {
                if (!item || typeof item !== 'object') {
                    return normalizeText(item);
                }

                const message = normalizeText(item.msg) || normalizeText(item.message);
                const location = Array.isArray(item.loc) && item.loc.length
                    ? ` (${item.loc.join('.')})`
                    : '';

                if (message) {
                    return `${message}${location}`;
                }

                try {
                    return JSON.stringify(item);
                } catch (_error) {
                    return String(item);
                }
            })
            .filter(Boolean);

        return messages.join('; ');
    }

    if (detail && typeof detail === 'object') {
        try {
            return JSON.stringify(detail);
        } catch (_error) {
            return String(detail);
        }
    }

    return normalizeText(detail);
}

function normalizeStatus(status) {
    const normalized = normalizeText(status).toLowerCase();
    if (!normalized) return 'unknown';

    if (['ready', 'running'].includes(normalized)) return 'ready';
    if (['allocating', 'pending', 'loading', 'initializing', 'jupyter_starting'].includes(normalized)) {
        return normalized;
    }
    if (['failed', 'error'].includes(normalized)) return 'failed';
    if (normalized === 'not_found') return 'not_found';
    return normalized;
}

function buildReservationEndAtIso(reservation) {
    if (!reservation?.date || !reservation?.endTime) {
        return null;
    }

    const end = new Date(`${reservation.date}T${reservation.endTime}:00`);
    if (Number.isNaN(end.getTime())) {
        return null;
    }

    return end.toISOString();
}

function resolveOneClickUrl(path, query = {}) {
    const baseUrl = normalizeText(config.oneClickBaseUrl).replace(/\/+$/, '');
    if (!baseUrl) {
        throw new AppError(500, 'ONECLICK_BASE_URL is not configured.');
    }

    const url = new URL(path, `${baseUrl}/`);
    Object.entries(query).forEach(([key, value]) => {
        const normalizedValue = normalizeText(value);
        if (normalizedValue) {
            url.searchParams.set(key, normalizedValue);
        }
    });
    return url.toString();
}

function buildOneClickHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = normalizeText(config.oneClickBridgeToken);
    if (token) {
        headers['x-bridge-token'] = token;
    }
    return headers;
}

async function oneClickRequest(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const url = resolveOneClickUrl(path, options.query || {});
    const controller = new AbortController();
    const timeoutMs = Number(config.oneClickTimeoutMs) > 0 ? Number(config.oneClickTimeoutMs) : 15000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            method,
            headers: buildOneClickHeaders(),
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: controller.signal
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            const detail = formatOneClickErrorDetail(
                payload?.detail || payload?.error || payload?.message || ''
            );
            const message = detail
                ? `OneClick API ${response.status}: ${detail}`
                : `OneClick request failed (${response.status})`;
            throw new AppError(502, message, payload);
        }

        return payload || {};
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new AppError(504, 'Timed out while contacting OneClick service.');
        }

        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError(502, `Unable to reach OneClick service: ${error.message}`);
    } finally {
        clearTimeout(timeout);
    }
}

function mapWorkspaceRow(row) {
    return {
        id: row.id,
        teamId: row.team_id,
        reservationId: row.reservation_id,
        email: row.notebook_email,
        status: row.notebook_status,
        message: row.status_message,
        reservationEndAt: row.reservation_end_at,
        url: row.notebook_url,
        source: row.source,
        launchedAt: row.launched_at,
        lastSyncedAt: row.last_synced_at,
        closedAt: row.closed_at
    };
}

async function getLatestWorkspaceSession(currentUser, reservationId = '') {
    if (!currentUser) {
        throw new AppError(401, 'Authentication required.');
    }

    const normalizedReservationId = normalizeReservationId(reservationId);
    const params = [];
    const clauses = [];

    if (currentUser.role !== 'admin') {
        params.push(currentUser.id);
        clauses.push(`ws.team_id = $${params.length}`);
    }

    if (normalizedReservationId) {
        params.push(normalizedReservationId);
        clauses.push(`ws.reservation_id = $${params.length}`);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await db.query(
        `SELECT ws.*
         FROM workspace_sessions ws
         ${whereClause}
         ORDER BY ws.launched_at DESC
         LIMIT 1`,
        params
    );

    if (result.rowCount === 0) {
        return null;
    }

    return mapWorkspaceRow(result.rows[0]);
}

async function resolveReservationEntitlement(currentUser, reservationId = '') {
    const normalizedReservationId = normalizeText(reservationId);

    if (currentUser.role === 'admin' && !normalizedReservationId) {
        return null;
    }

    const activeReservation = await reservationService.getActiveReservationForUser(currentUser, normalizedReservationId);
    if (!activeReservation) {
        if (normalizedReservationId) {
            throw new AppError(403, 'Specified reservation is not currently active.');
        }
        throw new AppError(403, 'No active reservation. Notebook launch is only allowed during your reserved time.');
    }

    return activeReservation;
}

async function saveWorkspaceSession({
    currentUser,
    reservationId,
    reservationEndAt,
    email,
    status,
    message,
    url
}) {
    const normalizedReservationId = normalizeReservationId(reservationId) || null;

    const result = await db.query(
        `INSERT INTO workspace_sessions (
            team_id,
            reservation_id,
            notebook_email,
            notebook_url,
            notebook_status,
            status_message,
            reservation_end_at,
            source,
            last_synced_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'reservation', NOW())
         RETURNING *`,
        [
            currentUser.id,
            normalizedReservationId,
            email,
            url || null,
            status,
            message || null,
            reservationEndAt || null
        ]
    );

    return mapWorkspaceRow(result.rows[0]);
}

async function updateWorkspaceSessionStatus(sessionId, payload = {}) {
    const normalizedStatus = normalizeStatus(payload.status);
    const shouldClose = ['failed', 'not_found'].includes(normalizedStatus);

    const result = await db.query(
        `UPDATE workspace_sessions
         SET notebook_status = $2,
             status_message = $3,
             notebook_url = COALESCE($4, notebook_url),
             last_synced_at = NOW(),
             closed_at = CASE
                 WHEN $5::boolean THEN COALESCE(closed_at, NOW())
                 ELSE closed_at
             END
         WHERE id = $1
         RETURNING *`,
        [
            sessionId,
            normalizedStatus,
            normalizeText(payload.message) || null,
            normalizeText(payload.url) || null,
            shouldClose
        ]
    );

    if (result.rowCount === 0) {
        throw new AppError(404, 'Workspace session not found.');
    }

    return mapWorkspaceRow(result.rows[0]);
}

async function requestWorkspace(currentUser, payload = {}) {
    if (!currentUser) {
        throw new AppError(401, 'Authentication required.');
    }

    const rawReservationId = normalizeText(payload.reservationId);
    const reservationId = normalizeReservationId(rawReservationId);
    const image = normalizeText(payload.image);
    const email = normalizeText(currentUser.email).toLowerCase();
    const ownerUsername = normalizeText(currentUser.username);

    if (rawReservationId && !reservationId && currentUser.role === 'admin') {
        throw new AppError(400, 'Invalid reservation identifier. Refresh the page and try again.');
    }

    if (!email) {
        throw new AppError(400, 'Your account is missing email. Ask admin to set team email before launching a notebook.');
    }

    if (!isValidNotebookEmail(email)) {
        throw new AppError(
            400,
            `Your account email "${email}" is invalid for notebook launch. Ask admin to set a valid email (e.g. team01@example.com).`
        );
    }

    const entitlement = await resolveReservationEntitlement(currentUser, reservationId);
    const reservationEndAt = buildReservationEndAtIso(entitlement);
    const oneClickResponse = await oneClickRequest('/api/notebook/request', {
        method: 'POST',
        body: {
            email,
            ...(ownerUsername ? { owner_username: ownerUsername } : {}),
            ...(reservationEndAt ? { reservation_end_at: reservationEndAt } : {}),
            ...(image ? { image } : {})
        }
    });

    const workspaceSession = await saveWorkspaceSession({
        currentUser,
        reservationId: entitlement?.id || null,
        reservationEndAt,
        email,
        status: normalizeStatus(oneClickResponse.status),
        message: oneClickResponse.message,
        url: oneClickResponse.url
    });

    return {
        workspace: {
            ...workspaceSession,
            reservationId: entitlement?.id || workspaceSession.reservationId,
            reservation: entitlement || null
        }
    };
}

async function getWorkspaceStatus(currentUser, filters = {}) {
    if (!currentUser) {
        throw new AppError(401, 'Authentication required.');
    }

    const rawReservationId = normalizeText(filters.reservationId);
    const reservationId = normalizeReservationId(rawReservationId);
    if (rawReservationId && !reservationId) {
        return {
            workspace: {
                status: 'not_found',
                message: 'Reservation identifier is invalid. Refresh the page.',
                reservationId: null
            }
        };
    }
    const existingSession = await getLatestWorkspaceSession(currentUser, reservationId);
    if (!existingSession) {
        return {
            workspace: {
                status: 'not_found',
                message: 'No notebook launch found yet.',
                reservationId: reservationId || null
            }
        };
    }

    const oneClickResponse = await oneClickRequest('/api/notebook/status', {
        method: 'GET',
        query: { email: existingSession.email }
    });

    const updatedSession = await updateWorkspaceSessionStatus(existingSession.id, oneClickResponse);
    return {
        workspace: updatedSession
    };
}

module.exports = {
    requestWorkspace,
    getWorkspaceStatus
};
