const db = require('../db');
const config = require('../config');
const { AppError } = require('../utils/errors');
const { buildHourlySlots, minutesToTime, parseTimeToMinutes } = require('../utils/time');

function isValidDate(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date || '');
}

function toHourMinute(value) {
    if (typeof value !== 'string') return value;
    return value.slice(0, 5);
}

function normalizeText(value) {
    return String(value || '').trim();
}

function normalizePlatformKey(value) {
    return normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

const temporarilyUnavailablePlatformKeys = new Set(
    ['node#2', 'node2'].map((name) => normalizePlatformKey(name))
);

function isPlatformTemporarilyUnavailable(platformName) {
    return temporarilyUnavailablePlatformKeys.has(normalizePlatformKey(platformName));
}

function getReservationTimezone() {
    return normalizeText(config.reservationTimezone) || 'Asia/Shanghai';
}

async function getPlatformByName(platformName, client = db) {
    const result = await client.query(
        `SELECT id, name
         FROM platforms
         WHERE name = $1
           AND is_active = TRUE`,
        [platformName]
    );

    if (result.rowCount === 0) {
        throw new AppError(404, `Platform "${platformName}" was not found.`);
    }

    const platformRow = result.rows[0];
    if (isPlatformTemporarilyUnavailable(platformRow.name)) {
        throw new AppError(409, `Platform "${platformRow.name}" is temporarily unavailable while NodeB is down.`);
    }

    return platformRow;
}

async function getPlatforms() {
    const result = await db.query(
        `SELECT id, name
         FROM platforms
         WHERE is_active = TRUE
         ORDER BY name`
    );

    return result.rows.map((row) => {
        const isAvailable = !isPlatformTemporarilyUnavailable(row.name);
        return {
            id: row.id,
            name: row.name,
            isAvailable,
            unavailableReason: isAvailable ? null : 'NodeB is down'
        };
    });
}

async function getAvailability(platform, date) {
    const normalizedPlatform = normalizeText(platform);
    const normalizedDate = normalizeText(date);

    if (!normalizedPlatform) {
        throw new AppError(400, 'Query parameter "platform" is required.');
    }
    if (!isValidDate(normalizedDate)) {
        throw new AppError(400, 'Query parameter "date" must be in YYYY-MM-DD format.');
    }

    const platformRow = await getPlatformByName(normalizedPlatform);

    const [slotsResult, reservationsResult] = await Promise.all([
        db.query(
            `SELECT EXTRACT(HOUR FROM slot_start)::int AS hour
             FROM reservation_slots
             WHERE platform_id = $1
               AND slot_start::date = $2::date
             ORDER BY hour`,
            [platformRow.id, normalizedDate]
        ),
        db.query(
            `SELECT r.id,
                    r.reservation_date::text AS date,
                    r.start_time::text AS start_time,
                    r.end_time::text AS end_time,
                    r.duration_hours,
                    r.name,
                    r.email,
                    r.phone,
                    r.notes,
                    r.created_at
             FROM reservations r
             WHERE r.platform_id = $1
               AND r.reservation_date = $2::date
             ORDER BY r.start_time`,
            [platformRow.id, normalizedDate]
        )
    ]);

    const reservedHours = new Set(slotsResult.rows.map((row) => Number(row.hour)));
    const slots = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        reserved: reservedHours.has(hour)
    }));

    return {
        platform: platformRow.name,
        date: normalizedDate,
        slots,
        reservations: reservationsResult.rows.map((row) => ({
            id: row.id,
            platform: platformRow.name,
            date: row.date,
            time: toHourMinute(row.start_time),
            endTime: toHourMinute(row.end_time),
            duration: row.duration_hours,
            name: row.name,
            email: row.email,
            phone: row.phone,
            notes: row.notes,
            createdAt: row.created_at
        }))
    };
}

async function listReservations(filters = {}, currentUser) {
    if (!currentUser) {
        throw new AppError(401, 'Authentication required.');
    }

    const clauses = [];
    const params = [];

    if (filters.platform) {
        params.push(normalizeText(filters.platform));
        clauses.push(`p.name = $${params.length}`);
    }

    if (filters.date) {
        if (!isValidDate(filters.date)) {
            throw new AppError(400, 'Query parameter "date" must be in YYYY-MM-DD format.');
        }
        params.push(filters.date);
        clauses.push(`r.reservation_date = $${params.length}::date`);
    }

    if (currentUser.role !== 'admin') {
        params.push(currentUser.id);
        clauses.push(`r.team_id = $${params.length}`);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const result = await db.query(
        `SELECT r.id,
                p.name AS platform,
                r.reservation_date::text AS date,
                r.start_time::text AS start_time,
                r.end_time::text AS end_time,
                r.duration_hours,
                r.name,
                r.email,
                r.phone,
                r.notes,
                t.username AS owner,
                r.created_at
         FROM reservations r
         JOIN platforms p ON p.id = r.platform_id
         LEFT JOIN teams t ON t.id = r.team_id
         ${whereClause}
         ORDER BY r.reservation_date, r.start_time`,
        params
    );

    return result.rows.map((row) => ({
        id: row.id,
        platform: row.platform,
        date: row.date,
        time: toHourMinute(row.start_time),
        endTime: toHourMinute(row.end_time),
        duration: row.duration_hours,
        name: row.name,
        email: row.email,
        phone: row.phone,
        notes: row.notes,
        owner: row.owner,
        createdAt: row.created_at
    }));
}

async function createReservation(payload, currentUser) {
    if (!currentUser) {
        throw new AppError(401, 'Authentication required.');
    }

    const platform = normalizeText(payload.platform);
    const date = normalizeText(payload.date);
    const startTime = normalizeText(payload.startTime);
    const duration = Number(payload.duration);
    const name = normalizeText(payload.name);
    const email = normalizeText(payload.email);
    const phone = normalizeText(payload.phone);
    const notes = normalizeText(payload.notes);

    if (!platform) throw new AppError(400, '"platform" is required.');
    if (!isValidDate(date)) throw new AppError(400, '"date" must be in YYYY-MM-DD format.');
    if (!startTime) throw new AppError(400, '"startTime" is required.');
    if (!Number.isInteger(duration) || duration <= 0) {
        throw new AppError(400, '"duration" must be a positive integer.');
    }
    if (!name) throw new AppError(400, '"name" is required.');
    if (!email) throw new AppError(400, '"email" is required.');

    const startMinutes = parseTimeToMinutes(startTime);
    if (startMinutes === null) {
        throw new AppError(400, '"startTime" must be a valid HH:mm string.');
    }
    if (startMinutes % 60 !== 0) {
        throw new AppError(400, 'Only full-hour slots are supported (e.g. 09:00).');
    }

    const endMinutes = startMinutes + (duration * 60);
    if (endMinutes >= 24 * 60) {
        throw new AppError(400, 'Reservation cannot cross midnight.');
    }

    const slotStarts = buildHourlySlots(date, startTime, duration);
    if (!slotStarts || slotStarts.length === 0) {
        throw new AppError(400, 'Unable to build reservation slot range from provided inputs.');
    }

    const endTime = minutesToTime(endMinutes);
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        const platformRow = await getPlatformByName(platform, client);
        const reservationResult = await client.query(
            `INSERT INTO reservations (
                platform_id,
                team_id,
                reservation_date,
                start_time,
                end_time,
                duration_hours,
                name,
                email,
                phone,
                notes
            ) VALUES ($1, $2, $3::date, $4::time, $5::time, $6, $7, $8, $9, $10)
            RETURNING id, created_at`,
            [
                platformRow.id,
                currentUser.id,
                date,
                `${startTime}:00`,
                `${endTime}:00`,
                duration,
                name,
                email,
                phone || null,
                notes || null
            ]
        );

        const reservationId = reservationResult.rows[0].id;
        const reservationParamIndex = slotStarts.length + 2;
        const slotValues = slotStarts
            .map((_, index) => `($1, $${index + 2}::timestamp, $${reservationParamIndex})`)
            .join(', ');

        await client.query(
            `INSERT INTO reservation_slots (platform_id, slot_start, reservation_id)
             VALUES ${slotValues}`,
            [platformRow.id, ...slotStarts, reservationId]
        );

        await client.query('COMMIT');

        return {
            id: reservationId,
            platform: platformRow.name,
            date,
            time: startTime,
            endTime,
            duration,
            name,
            email,
            phone: phone || null,
            notes: notes || null,
            owner: currentUser.username,
            createdAt: reservationResult.rows[0].created_at
        };
    } catch (error) {
        await client.query('ROLLBACK');

        if (error.code === '23505') {
            throw new AppError(409, 'Selected slot range is no longer available. Refresh availability and try again.');
        }

        throw error;
    } finally {
        client.release();
    }
}

async function deleteReservation(id, currentUser) {
    if (!currentUser) {
        throw new AppError(401, 'Authentication required.');
    }

    const reservationId = normalizeText(id);
    if (!reservationId) {
        throw new AppError(400, 'Reservation id is required.');
    }

    let result;
    if (currentUser.role === 'admin') {
        result = await db.query(
            `DELETE FROM reservations
             WHERE id = $1
             RETURNING id`,
            [reservationId]
        );
    } else {
        result = await db.query(
            `DELETE FROM reservations
             WHERE id = $1
               AND team_id = $2
             RETURNING id`,
            [reservationId, currentUser.id]
        );
    }

    if (result.rowCount === 0) {
        throw new AppError(404, 'Reservation not found.');
    }
}

async function cleanupExpiredReservations(currentUser) {
    if (!currentUser) {
        throw new AppError(401, 'Authentication required.');
    }

    const result = await db.query(
        `DELETE FROM reservations
         WHERE (reservation_date::timestamp + end_time) < (NOW() AT TIME ZONE $1)
         RETURNING id`,
        [getReservationTimezone()]
    );

    return {
        deletedCount: result.rowCount
    };
}

async function getActiveReservationForUser(currentUser, reservationId = '') {
    if (!currentUser) {
        throw new AppError(401, 'Authentication required.');
    }

    const normalizedReservationId = normalizeText(reservationId);
    const timezone = getReservationTimezone();
    const nowExpression = '(NOW() AT TIME ZONE $1)';
    const clauses = [
        `(r.reservation_date::timestamp + r.start_time) <= ${nowExpression}`,
        `${nowExpression} < (r.reservation_date::timestamp + r.end_time)`
    ];
    const params = [timezone];

    if (currentUser.role !== 'admin') {
        params.push(currentUser.id);
        clauses.push(`r.team_id = $${params.length}`);
    }

    if (normalizedReservationId) {
        params.push(normalizedReservationId);
        clauses.push(`r.id = $${params.length}`);
    }

    const result = await db.query(
        `SELECT r.id,
                r.team_id,
                r.reservation_date::text AS date,
                r.start_time::text AS start_time,
                r.end_time::text AS end_time,
                r.duration_hours,
                p.name AS platform,
                t.username AS owner
         FROM reservations r
         JOIN platforms p ON p.id = r.platform_id
         LEFT JOIN teams t ON t.id = r.team_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY r.reservation_date DESC, r.start_time DESC
         LIMIT 1`,
        params
    );

    if (result.rowCount === 0) {
        return null;
    }

    const row = result.rows[0];
    return {
        id: row.id,
        teamId: row.team_id,
        owner: row.owner || null,
        platform: row.platform,
        date: row.date,
        time: toHourMinute(row.start_time),
        endTime: toHourMinute(row.end_time),
        duration: row.duration_hours
    };
}

module.exports = {
    getPlatforms,
    getAvailability,
    listReservations,
    createReservation,
    deleteReservation,
    cleanupExpiredReservations,
    getActiveReservationForUser
};
