# Reservation Frontend

This frontend now uses the backend API + PostgreSQL for real multi-user reservations.

## Features

- Two platforms: `Node#1`, `Node#2`
- Account login required before reservation actions
- Password reset tab for admin-provisioned team accounts
- 24-hour timeline with live backend availability
- Two-click range selection:
  - first click = start slot
  - second click = inclusive end slot
- Conflict-safe booking and cancellation
- Upcoming reservations list synced from backend account session
- Expired reservations are auto-cleaned on page refresh/login
- Active reservation can launch/open OneClick notebook workspace

## Runtime Architecture

- `web/script.js` fetches data from backend API
- No browser `localStorage` reservation persistence is used anymore
- Backend source of truth is PostgreSQL (`backend/db/schema.sql`)
- Workspace launch/status uses backend bridge endpoints:
  - `POST /api/workspaces/request`
  - `GET /api/workspaces/status`

## Run the Full System

1) Start backend

```bash
cd ../backend
cp .env.example .env
# Edit DATABASE_URL in .env
npm install
npm run db:init
npm run dev
```

Default debug account (seeded by schema):

- Username: `admin`
- Password: `amd1234!`

Team accounts are created by admin. Teams can use the frontend reset-password tab to change their assigned/default password.

2) Open frontend

- Open `index.html` directly in browser, or serve `web/` with a static server.
- Default backend URL expected by frontend is `http://localhost:4100/api`.

If needed, override API base URL before loading `script.js`:

```html
<script>
  window.RESERVATION_API_BASE_URL = 'http://your-host:4100/api';
</script>
```

## Important Files

- `index.html` - UI structure
- `styles.css` - visual styling
- `script.js` - frontend logic + API integration

