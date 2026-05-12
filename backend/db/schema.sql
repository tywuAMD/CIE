CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    password_hash TEXT NOT NULL,
    ssh_pubkey TEXT,
    role TEXT NOT NULL DEFAULT 'team' CHECK (role IN ('team', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE teams
ADD COLUMN IF NOT EXISTS email TEXT;

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

CREATE TABLE IF NOT EXISTS workspace_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
    notebook_email TEXT NOT NULL,
    notebook_url TEXT,
    notebook_status TEXT NOT NULL,
    status_message TEXT,
    reservation_end_at TIMESTAMPTZ,
    source TEXT NOT NULL DEFAULT 'reservation',
    launched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

ALTER TABLE workspace_sessions
ADD COLUMN IF NOT EXISTS reservation_end_at TIMESTAMPTZ;

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

CREATE INDEX IF NOT EXISTS idx_workspace_sessions_team_id
    ON workspace_sessions(team_id);

CREATE INDEX IF NOT EXISTS idx_workspace_sessions_reservation_id
    ON workspace_sessions(reservation_id);

CREATE INDEX IF NOT EXISTS idx_workspace_sessions_active
    ON workspace_sessions(team_id, launched_at DESC)
    WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_sessions_reservation_end_at
    ON workspace_sessions(reservation_end_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_email_unique
    ON teams(email)
    WHERE email IS NOT NULL;

INSERT INTO platforms (name)
VALUES ('Node#1'), ('Node#2')
ON CONFLICT (name) DO NOTHING;

INSERT INTO teams (username, email, password_hash, ssh_pubkey, role, is_active)
VALUES ('admin', 'admin@local.invalid', crypt('amd1234!', gen_salt('bf')), '', 'admin', TRUE)
ON CONFLICT (username) DO UPDATE
SET email = COALESCE(NULLIF(teams.email, ''), EXCLUDED.email),
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    is_active = TRUE;
