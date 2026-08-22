# Ingest fetch proxy (Cloudflare Worker)

GitHub Actions datacenter IPs are blocked by GeekWire. This Worker fetches
`geekwire.com` from Cloudflare’s edge and is the only host it will proxy.

## Deploy

```bash
cd workers/ingest-proxy
npx wrangler login
npx wrangler deploy
```

Copy the Worker URL (e.g. `https://vekta-ingest-proxy.<account>.workers.dev`) into
the GitHub Actions secret `INGEST_FETCH_PROXY_URL` (no path, no trailing query).

The funding-ingest GeekWire fetcher will call:

`{INGEST_FETCH_PROXY_URL}?url={encoded-https-url}`
