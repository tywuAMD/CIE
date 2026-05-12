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
            '  node scripts/add-user.js --username <name> --email <email> --ssh-pubkey <ssh_key> (--password <plain_password> | --password-hash <hash>) [--role team|admin]',
            '',
            'Examples:',
            "  node scripts/add-user.js --username team01 --email team01@example.com --password 'team-pass' --ssh-pubkey 'ssh-ed25519 AAAAC3Nza... team01@host'",
            "  node scripts/add-user.js --username team02 --email team02@example.com --password-hash '$2a$...' --ssh-pubkey 'ssh-rsa AAAAB3Nza... team02@host'"
        ].join('\n')
    );
    process.exit(exitCode);
}

function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+$/.test(email);
}

async function hashPassword(password) {
    const result = await db.query(
        "SELECT crypt($1, gen_salt('bf')) AS password_hash",
        [password]
    );
    return result.rows[0].password_hash;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
        printUsageAndExit(null, 0);
    }

    const username = typeof args.username === 'string' ? args.username.trim() : '';
    const email = normalizeEmail(args.email);
    const sshPubkey = typeof args['ssh-pubkey'] === 'string' ? args['ssh-pubkey'].trim() : '';
    const role = typeof args.role === 'string' ? args.role.trim().toLowerCase() : 'team';
    const password = typeof args.password === 'string' ? args.password : null;
    const passwordHashArg = typeof args['password-hash'] === 'string' ? args['password-hash'].trim() : '';

    if (!username) {
        printUsageAndExit('--username is required.');
    }

    if (!email) {
        printUsageAndExit('--email is required.');
    }

    if (!isValidEmail(email)) {
        printUsageAndExit('--email must look like user@domain.');
    }

    if (!sshPubkey) {
        printUsageAndExit('--ssh-pubkey is required.');
    }

    if (!password && !passwordHashArg) {
        printUsageAndExit('Provide either --password or --password-hash.');
    }

    if (password && passwordHashArg) {
        printUsageAndExit('Use either --password or --password-hash, not both.');
    }

    if (!['team', 'admin'].includes(role)) {
        printUsageAndExit("--role must be either 'team' or 'admin'.");
    }

    const passwordHash = password ? await hashPassword(password) : passwordHashArg;

    const query = `
        INSERT INTO teams (username, email, password_hash, ssh_pubkey, role, is_active)
        VALUES ($1, $2, $3, $4, $5, TRUE)
        ON CONFLICT (username) DO UPDATE SET
            email = EXCLUDED.email,
            password_hash = EXCLUDED.password_hash,
            ssh_pubkey = EXCLUDED.ssh_pubkey,
            role = EXCLUDED.role,
            is_active = TRUE
        RETURNING id, username, email, role, is_active
    `;

    const result = await db.query(query, [username, email, passwordHash, sshPubkey, role]);
    const user = result.rows[0];

    console.log(`User upserted: id=${user.id}, username=${user.username}, email=${user.email}, role=${user.role}, active=${user.is_active}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Failed to add user:', error.message);
        process.exit(1);
    });
