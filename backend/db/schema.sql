CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    ssh_pubkey TEXT,
    role TEXT NOT NULL DEFAULT 'team' CHECK (role IN ('team', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE teams
ADD COLUMN IF NOT EXISTS ssh_pubkey TEXT;

CREATE TABLE IF NOT EXISTS platforms (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id INTEGER NOT NULL REFERENCES platforms(id),
    team_id INTEGER REFERENCES teams(id),
    reservation_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_hours INTEGER NOT NULL CHECK (duration_hours > 0),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id);

CREATE TABLE IF NOT EXISTS reservation_slots (
    platform_id INTEGER NOT NULL REFERENCES platforms(id),
    slot_start TIMESTAMP NOT NULL,
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    PRIMARY KEY (platform_id, slot_start)
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    session_token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_platform_date
    ON reservations(platform_id, reservation_date);

CREATE INDEX IF NOT EXISTS idx_reservations_team_id
    ON reservations(team_id);

CREATE INDEX IF NOT EXISTS idx_slots_date
    ON reservation_slots((slot_start::date));

CREATE INDEX IF NOT EXISTS idx_sessions_team_id
    ON sessions(team_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions(expires_at);

INSERT INTO platforms (name)
VALUES ('Node#1'), ('Node#2')
ON CONFLICT (name) DO NOTHING;

INSERT INTO teams (username, password_hash, ssh_pubkey, role, is_active)
VALUES ('admin', crypt('amd1234!', gen_salt('bf')), '', 'admin', TRUE)
ON CONFLICT (username) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    is_active = TRUE;
