#!/usr/bin/env node

const db = require('../src/db');

function parseArgs(argv) {
    const args = {};

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) {
            continue;
        }

        const key = token.slice(2);
        const next = argv[index + 1];

        if (!next || next.startsWith('--')) {
            args[key] = true;
            continue;
        }

        args[key] = next;
        index += 1;
    }

    return args;
}

function printUsageAndExit(message, exitCode = 1) {
    if (message) {
        console.error(`Error: ${message}`);
    }

    console.log(
        [
            'Usage:',
            '  node scripts/remove-platform.js [--name <platform_name>]',
            '',
            'Behavior:',
            '  - With --name: remove one platform and its reservations',
            '  - Without --name: remove ALL platforms and all reservations',
            '',
            'Examples:',
            '  node scripts/remove-platform.js --name Node3',
            '  node scripts/remove-platform.js'
        ].join('\n')
    );
    process.exit(exitCode);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        printUsageAndExit(null, 0);
    }

    const name = typeof args.name === 'string' ? args.name.trim() : '';
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        const targetResult = name
            ? await client.query(
                `SELECT id, name
                 FROM platforms
                 WHERE name = $1`,
                [name]
            )
            : await client.query(
                `SELECT id, name
                 FROM platforms
                 ORDER BY name`
            );

        if (targetResult.rowCount === 0) {
            await client.query('ROLLBACK');
            if (name) {
                console.log(`No platform found with name "${name}".`);
            } else {
                console.log('No platforms found to remove.');
            }
            return;
        }

        const platformIds = targetResult.rows.map((row) => row.id);
        const platformNames = targetResult.rows.map((row) => row.name);

        const deletedReservationsResult = await client.query(
            `DELETE FROM reservations
             WHERE platform_id = ANY($1::int[])
             RETURNING id`,
            [platformIds]
        );

        const deletedPlatformsResult = await client.query(
            `DELETE FROM platforms
             WHERE id = ANY($1::int[])
             RETURNING id`,
            [platformIds]
        );

        await client.query('COMMIT');

        console.log(`Platforms removed: ${deletedPlatformsResult.rowCount}`);
        console.log(`Reservations removed: ${deletedReservationsResult.rowCount}`);
        console.log(`Removed platform name(s): ${platformNames.join(', ')}`);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Failed to remove platform(s):', error.message);
        process.exit(1);
    });
