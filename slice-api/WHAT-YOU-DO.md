# What you do next (OMV + Tailscale + website)

This repo now includes everything for **exact STL pricing** via a home slice server.

## A. On your OpenMediaVault PC

1. Copy `slice-api/` to the server (or `git pull` if you already cloned)
2. Create `.env` from the example and set the API key:

```bash
cd ~/slice-api   # or /srv/artblu/slice-api
cp .env.example .env
nano .env        # set SLICE_API_KEY=...
```

3. Build & run:

```bash
docker compose up -d --build
docker compose logs -f
```

4. Local health check:

```bash
curl -s http://127.0.0.1:8787/health
```

**Note:** If your API key contains `$`, put it in `.env` (not in YAML). The earlier Compose warning `variable is not set` was from `$…` being treated as interpolation.

## B. Tailscale Funnel (so public visitors can reach the API)

Browser users of your website are **not** on your Tailscale network, so a normal Tailscale IP is not enough.

```bash
sudo tailscale funnel --bg 8787
sudo tailscale funnel status
```

Copy the HTTPS URL (example: `https://omv.tailXXXX.ts.net`).

Your Funnel URL (verified): `https://nas.taileecf41.ts.net/` — set as `SLICE_API_URL` **Supabase secret** (not in the website).

Test from phone cellular:

```bash
curl -s https://nas.taileecf41.ts.net/health
```

## C. Website (`index.html`)

Set these two constants near the top of the script:

```js
const SLICE_API_URL = 'https://nas.taileecf41.ts.net';
const SLICE_API_KEY = 'same-secret-as-.env';
```

Commit / deploy the static site. On your PC with Tailscale, Chrome may ask to allow local network once — click **Allow**.

## D. Verify end-to-end

1. Open the shop → upload an STL  
2. You should see “Se calculează…” then **exact price + hours + grams**  
3. Submit an order → admin shows the quoted numbers  

## Notes

- Preset target: **Bambu P2S**, **0.20mm Standard PLA**, **supports ON** (OrcaSlicer profiles; falls back to P1S if P2S JSON is missing in that Orca build)
- Price uses your existing Supabase `pricing_settings` formula (`bambu-pricing.js`)
- Keep OMV online when customers upload; if the API is down, the site falls back to a rough estimate

Full detail: `slice-api/README.md`
