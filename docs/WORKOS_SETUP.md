# WorkOS Setup

This app uses WorkOS AuthKit with:

- Sign-in entry route: `http://localhost:5173/login`
- Redirect/callback route: `http://localhost:5173/auth`

## Environment Split

- Staging client ID: `client_01KPVXV875W2CA20EVJCHBB360`
- Production client ID: `client_01KPVXV8TX9P50WV1J795J51F4`

## Local Development

Use the staging client ID in `.env.local`:

```env
WORKOS_CLIENT_ID=client_01KPVXV875W2CA20EVJCHBB360
VITE_WORKOS_CLIENT_ID=client_01KPVXV875W2CA20EVJCHBB360
WORKOS_REDIRECT_URI=http://localhost:5173/auth
VITE_WORKOS_REDIRECT_URI=http://localhost:5173/auth
VITE_WORKOS_DEV_MODE=true
```

In the WorkOS Sandbox/Staging environment, register:

- Sign-in endpoint: `http://localhost:5173/login`
- Redirect URI: `http://localhost:5173/auth`
- Allowed origin: `http://localhost:5173`

If you open the app on `127.0.0.1` instead of `localhost`, add matching `127.0.0.1` entries in WorkOS too.

## Production

Use the production client ID in your production environment variables:

```env
WORKOS_CLIENT_ID=client_01KPVXV8TX9P50WV1J795J51F4
VITE_WORKOS_CLIENT_ID=client_01KPVXV8TX9P50WV1J795J51F4
```

In the WorkOS Production environment, register your real production host values:

- Sign-in endpoint: `https://<your-domain>/login`
- Redirect URI: `https://<your-domain>/auth`
- Allowed origin: `https://<your-domain>`

## Notes

- WorkOS `client_id` values are safe to expose in the browser.
- WorkOS API keys are different from client IDs and should stay server-side only.
- Redirect URIs must match exactly in WorkOS, including protocol, hostname, port, and path.
