# artblu Slice API — run on OpenMediaVault + Tailscale

## What this is
A Docker service on your home server that:
1. Accepts an STL
2. Slices it with **OrcaSlicer** using **Bambu Lab P2S + default 0.20mm PLA + supports ON**
3. Returns `printHours` + `filamentGrams`
4. The website turns that into an **exact price** with your formula

Public website visitors **cannot** reach a plain Tailscale IP unless they are on your tailnet.
Use **Tailscale Funnel** (or Cloudflare Tunnel) so the storefront can call the API.

---

## 1. Copy to OMV
On the OMV machine (SSH):

```bash
mkdir -p /srv/artblu/slice-api
# copy this whole slice-api folder there (scp/rsync/git clone)
cd /srv/artblu/slice-api
```

Edit `.env` (copy from `.env.example`):
- set `SLICE_API_KEY` to a long random secret  
- if the secret contains `$`, keep it in `.env` (Compose won’t expand it the same way as in YAML)

```bash
cp .env.example .env
nano .env
```

## 2. Build & start

```bash
docker compose up -d --build
docker compose logs -f --tail=100
```

Check:

```bash
curl -s http://127.0.0.1:8787/health | jq
```

You want `"ok": true` and all three profiles `true`.

## Job log (SSH)

Every upload is kept on the NAS (original file + timestamp). After rebuild:

```bash
cd /srv/artblu/slice-api   # or wherever compose lives
chmod +x slice-jobs
./slice-jobs
```

Useful flags:

```bash
./slice-jobs -n 50      # more rows
./slice-jobs --files    # full saved paths
./slice-jobs --json
```

Same command inside Docker: `docker exec artblu-slice-api slice-jobs`

Files live in `./jobs/` next to `docker-compose.yml` (bind-mounted to `/jobs` in the container). Live lines also show in `docker compose logs -f`.

First start may take a while (AppImage extract + profile pick).
If P2S profile is missing in that Orca version, entrypoint falls back to **P1S** (very close bed/settings) and logs which file it used.

## 3. Tailscale Funnel (required for public site)

On the OMV host (Tailscale installed):

```bash
# enable HTTPS funnel to the API port
sudo tailscale funnel --bg 8787
sudo tailscale funnel status
```

You get a public URL like:
`https://omv.tailnet-xxxx.ts.net/`

Test from your phone (cellular, not Wi‑Fi):

```bash
curl -s https://YOUR-FUNNEL-HOST/health
curl -s -X POST https://YOUR-FUNNEL-HOST/estimate \
  -H "X-API-Key: YOUR_SECRET" \
  -F "file=@/path/to/test.stl" \
  -F "material=PLA"
```

## 4. Website config
In `index.html` set:

```js
const SLICE_API_URL = 'https://YOUR-FUNNEL-HOST';
const SLICE_API_KEY = 'YOUR_SECRET';
```

Redeploy / push the static site. The browser calls the NAS directly via Tailscale Funnel (no Supabase proxy).

**PC with Tailscale installed:** Chrome may ask once to allow “local network” — click **Allow**.

Optional Supabase proxy (if Funnel TLS fails from cloud): `supabase/SLICE-PROXY-SETUP.md`

## 5. Optional: lock CORS
In compose:

```yaml
CORS_ORIGINS: "https://your-github-pages-domain,https://your-custom-domain"
```

## 6. Custom profiles (optional, more exact)
If you want **byte-identical** to your Bambu Studio install:

1. In Bambu Studio / Orca, export or copy:
   - machine: `Bambu Lab P2S 0.4 nozzle`
   - process: `0.20mm Standard` (then enable supports)
   - filament: `Bambu PLA Basic` (or your default PLA)
2. Save as JSON with `"type": "machine"|"process"|"filament"`
3. Mount over the volume:

```yaml
volumes:
  - ./my-profiles:/profiles
```

With files:
- `/profiles/machine.json`
- `/profiles/process.json`
- `/profiles/filament.json`

Restart: `docker compose up -d`

## Troubleshooting
| Symptom | Fix |
|--------|-----|
| `Invalid or missing X-API-Key` | Key mismatch between compose and `index.html` |
| CORS errors in browser | Set `CORS_ORIGINS` to your site origin; rebuild/recreate |
| Browser asks for “local network” on artblu.ro | Use Supabase slice proxy (`supabase/SLICE-PROXY-SETUP.md`), not direct browser → NAS |
| Funnel works on LAN only | Test on cellular; confirm `tailscale funnel status` |
| Slice timeout | Raise `SLICE_TIMEOUT_SEC`; large STLs take longer |
| Profiles missing | Check logs; Orca version may not ship P2S yet → uses P1S fallback |
| `empty layers` / exit 156 (-100) / 206 (-50) | Incomplete profiles (missing bed size). Rebuild with flattened profiles: `docker compose down && docker compose up -d --build` (entrypoint refreshes `/profiles` each start) |
| AppImage extract fails at build | Rebuild on amd64 Linux host (OMV x86_64) |

## Security
- Never commit the real API key
- Funnel URL is public — the **API key** is the gate
- Rotate the key if it leaks
