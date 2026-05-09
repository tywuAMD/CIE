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
            '  node scripts/remove-user.js [--username <username>]',
            '  node scripts/remove-user.js [--name <username>]',
            '',
            'Behavior:',
            '  - With --username or --name: remove one user and their reservations',
            '  - Without --username/--name: remove ALL users and all reservations',
            '',
            'Examples:',
            '  node scripts/remove-user.js --username team01',
            '  node scripts/remove-user.js --name team01',
            '  node scripts/remove-user.js'
        ].join('\n')
    );
    process.exit(exitCode);
}

function resolveUsername(args) {
    const usernameArg = typeof args.username === 'string' ? args.username.trim() : '';
    const nameArg = typeof args.name === 'string' ? args.name.trim() : '';

    if (usernameArg && nameArg && usernameArg !== nameArg) {
        printUsageAndExit('--username and --name must match when both are provided.');
    }

    return usernameArg || nameArg;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        printUsageAndExit(null, 0);
    }

    const username = resolveUsername(args);
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        const targetResult = username
            ? await client.query(
                `SELECT id, username
                 FROM teams
                 WHERE username = $1`,
                [username]
            )
            : await client.query(
                `SELECT id, username
                 FROM teams
                 ORDER BY username`
            );

        if (targetResult.rowCount === 0) {
            await client.query('ROLLBACK');
            if (username) {
                console.log(`No user found with username "${username}".`);
            } else {
                console.log('No users found to remove.');
            }
            return;
        }

        const teamIds = targetResult.rows.map((row) => row.id);
        const usernames = targetResult.rows.map((row) => row.username);

        const deletedReservationsResult = await client.query(
            `DELETE FROM reservations
             WHERE team_id = ANY($1::int[])
             RETURNING id`,
            [teamIds]
        );

        const deletedUsersResult = await client.query(
            `DELETE FROM teams
             WHERE id = ANY($1::int[])
             RETURNING id`,
            [teamIds]
        );

        await client.query('COMMIT');

        console.log(`Users removed: ${deletedUsersResult.rowCount}`);
        console.log(`Reservations removed: ${deletedReservationsResult.rowCount}`);
        console.log(`Removed username(s): ${usernames.join(', ')}`);
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
        console.error('Failed to remove user(s):', error.message);
        process.exit(1);
    });
