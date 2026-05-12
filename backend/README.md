# Reservation Backend Skeleton

PostgreSQL + Express backend API skeleton for the CIE reservation system.

## 0) Initialize PostgreSQL instance

If PostgreSQL is not installed yet (Ubuntu/Debian):

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

Create a database user and database for this project:

```bash
sudo -u postgres psql -c "CREATE ROLE cie_user WITH LOGIN PASSWORD 'change_me';"
sudo -u postgres psql -c "CREATE DATABASE cie_reservation OWNER cie_user;"
```

If role/database already exist, you can skip the create commands.

## 1) Setup

```bash
cd backend
cp .env.example .env
```

Update `DATABASE_URL` in `.env` to point to your PostgreSQL instance.

```bash
DATABASE_URL=postgresql://cie_user:change_me@localhost:5432/cie_reservation
```

Do not use `postgres://postgres:postgres@localhost:5432/...` unless your PostgreSQL user/password is actually configured that way.  
If you see `password authentication failed for user "postgres"`, switch to the `cie_user` connection above (or set the correct real password for your chosen user).

For OneClick notebook bridge integration, also configure:

```bash
ONECLICK_BASE_URL=http://localhost:8000
ONECLICK_BRIDGE_TOKEN=
ONECLICK_TIMEOUT_MS=15000
```

## 2) Initialize database schema

```bash
npm run db:init
```

This creates:
- `platforms`
- `teams`
- `sessions`
- `reservations`
- `reservation_slots` (hour-level uniqueness lock)

and seeds:
- `Node#1`
- `Node#2`

## 3) Run API

```bash
npm run dev
```

Default base URL: `http://localhost:4100`

If OneClick is enabled, backend workspace endpoints call `${ONECLICK_BASE_URL}/api/notebook/*`.

## Default Debug Account

The schema seed creates a default admin user:

- Username: `admin`
- Email: `admin@local.invalid`
- Password: `amd1234!`

Team accounts are provisioned by admin (for example via `npm run user:add`).
Teams can change their assigned/default password via `POST /api/auth/reset-password`.

## Admin Utility Scripts

Run from `backend/`:

### 1) Add or update a user

```bash
npm run user:add -- --username team01 --email team01@example.com --ssh-pubkey "ssh-ed25519 AAAA... team01@host" --password team01pass
# or
npm run user:add -- --username team01 --email team01@example.com --ssh-pubkey "ssh-ed25519 AAAA... team01@host" --password-hash "$2a$..."
```

Arguments:
- Required: `--username`, `--email`, `--ssh-pubkey`, and one of `--password` or `--password-hash`
- Optional: `--role team|admin` (default: `team`)

Behavior:
- If username does not exist, a new user is inserted.
- If username exists, user is updated (email, password, `ssh_pubkey`, role) and reactivated (`is_active = TRUE`).
- `email` is stored in `teams.email`.
- `ssh_pubkey` is stored in `teams.ssh_pubkey`.

Help:
```bash
npm run user:add -- --help
```

### 2) Add or update a platform

```bash
npm run platform:add -- --name Node3
```

Arguments:
- Required: `--name`

Behavior:
- If platform name does not exist, a new platform is inserted.
- If platform name exists, it is reactivated (`is_active = TRUE`).

Help:
```bash
npm run platform:add -- --help
```

### 3) Remove user(s)

```bash
# Remove one user
npm run user:remove -- --username team01
# (alias)
npm run user:remove -- --name team01

# Remove ALL users
npm run user:remove
```

Behavior:
- With `--username` or `--name`: removes that user and their reservations.
- Without `--username`/`--name`: removes all users and all user-owned reservations.

Help:
```bash
npm run user:remove -- --help
```

### 4) Remove platform(s)

```bash
# Remove one platform
npm run platform:remove -- --name Node3

# Remove ALL platforms
npm run platform:remove
```

Behavior:
- With `--name`: removes that platform and reservations on it.
- Without `--name`: removes all platforms and all reservations.

Help:
```bash
npm run platform:remove -- --help
```

## API Endpoints

- `GET /health`
- `POST /api/auth/reset-password`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/platforms`
- `GET /api/availability?platform=Node#1&date=2026-05-07`
- `GET /api/reservations?platform=Node#1&date=2026-05-07`
- `POST /api/reservations`
- `POST /api/reservations/cleanup-expired`
- `DELETE /api/reservations/:id`
- `POST /api/workspaces/request`
- `GET /api/workspaces/status?reservationId=<uuid>`

## Example Create Reservation Payload

```json
{
  "platform": "Node#1",
  "date": "2026-05-07",
  "startTime": "12:00",
  "duration": 2,
  "name": "Team A",
  "email": "team-a@example.com",
  "phone": "12345678",
  "notes": "Need GPU support"
}
```

`duration` is measured in 1-hour slots.

## Kubernetes Deployment (Optional)

Reservation backend + PostgreSQL sample manifest is provided at:

- `backend/k8s-deployment.yaml`

This deploys:

- `cie-postgres` service (PostgreSQL)
- `cie-reservation-backend` service (`NodePort: 30410`)

Before applying:

- Build/push backend image and replace `ghcr.io/your-org/cie-reservation-backend:latest`.
- Update secret values (`DATABASE_URL`, `ONECLICK_BRIDGE_TOKEN`).
