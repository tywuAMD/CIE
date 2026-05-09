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
            '  node scripts/add-platform.js --name <platform_name>',
            '',
            'Example:',
            '  node scripts/add-platform.js --name Node3'
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
    if (!name) {
        printUsageAndExit('--name is required.');
    }

    const query = `
        INSERT INTO platforms (name, is_active)
        VALUES ($1, TRUE)
        ON CONFLICT (name) DO UPDATE SET
            is_active = TRUE
        RETURNING id, name, is_active
    `;

    const result = await db.query(query, [name]);
    const platform = result.rows[0];
    console.log(`Platform upserted: id=${platform.id}, name=${platform.name}, active=${platform.is_active}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Failed to add platform:', error.message);
        process.exit(1);
    });
