# Slice proxy (Supabase → home NAS)

The storefront **must not** call the NAS slice API directly from the browser. On PC, Chrome shows *“access other devices on your local network”* (Private Network Access). On phones, the request often fails with **Failed to fetch**.

Instead: browser uploads STL to Supabase Storage → **Edge Function** `slice-estimate` forwards to your NAS (Tailscale Funnel) → returns hours/grams.

## 1. Deploy the function

From the repo root (with [Supabase CLI](https://supabase.com/docs/guides/cli) logged in):

```bash
cd 3d-Print-Website
supabase functions deploy slice-estimate --project-ref tilfngrtldwevtiilxpq
```

## 2. Set secrets (Dashboard → Edge Functions → slice-estimate → Secrets)

**This is the most common cause of errors.** Without these, the function fails immediately.

| Secret | Value |
|--------|--------|
| `SLICE_API_URL` | Public HTTPS URL of slice API — see below |
| `SLICE_API_KEY` | Same as `SLICE_API_KEY` in `slice-api/.env` on OMV (see `.env.example`) |

**Important:** `https://nas.taileecf41.ts.net` (Tailscale Funnel) often works from your PC/browser but **fails from Supabase** with `tls handshake eof`. Use a **Cloudflare Tunnel** URL instead, e.g. `https://slice.artblu.ro` — full steps in **`slice-api/CLOUDFLARE-TUNNEL.md`**.

In Dashboard: **Project Settings → Edge Functions → Secrets** (secrets are shared across functions).

Or via CLI:

```bash
supabase secrets set SLICE_API_URL=https://nas.taileecf41.ts.net SLICE_API_KEY=your-secret --project-ref tilfngrtldwevtiilxpq
```

After changing secrets, **redeploy** the function (or wait ~1 min).

## Troubleshooting

| Error message | Fix |
|---------------|-----|
| `SLICE_API_URL / SLICE_API_KEY not configured` | Add both secrets in Dashboard (section 2 above) |
| `Could not read uploaded STL` / `Object not found` | Storage upload failed — run `admin-policies.sql` so anon can upload to `stl-files` |
| `Invalid or missing X-API-Key` | `SLICE_API_KEY` secret ≠ key in NAS `slice-api/.env` |
| `tls handshake eof` / `Connect` TLS error | Tailscale Funnel + Supabase cloud — switch `SLICE_API_URL` to Cloudflare Tunnel (`slice-api/CLOUDFLARE-TUNNEL.md`) |
| `Slice API 502` / fetch failed | NAS offline — run `curl https://slice.artblu.ro/health` (or your funnel URL) |
| Generic “non-2xx” (old deploy) | Redeploy function + site; new version returns readable `{ error: "..." }` |

Logs: **Dashboard → Edge Functions → slice-estimate → Logs** (shows the real error).

## 3. Storage

Uses existing **`stl-files`** bucket. Temp uploads go to `slice-temp/{uuid}.stl` (anon upload policy from `admin-policies.sql`).

The function deletes temp files after each quote.

## 4. Redeploy the website

Push / publish `index.html` (no API key in the browser anymore).

## 5. Test

1. On phone (cellular): upload a small STL on artblu.ro → price should appear after slice.
2. On PC: no local-network permission prompt.

Manual test:

```bash
# upload a test file to slice-temp/ via site or Storage dashboard, then:
curl -s -X POST "https://tilfngrtldwevtiilxpq.supabase.co/functions/v1/slice-estimate" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"path":"slice-temp/test.stl","material":"PLA","fileName":"test.stl"}'
```

## Limits

- Supabase Edge Functions: **~150s** wall time (free) / **400s** (paid). Very large/complex STLs may time out — contact flow still works.
- Max file size: same as slice-api (`MAX_UPLOAD_MB`, default 50).

## NAS still required

Keep Docker slice-api + Tailscale Funnel running on OMV. The proxy only changes **who** calls the API (Supabase cloud, not the visitor’s browser).
