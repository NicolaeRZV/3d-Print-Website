# Cloudflare Tunnel for slice API (recommended with Supabase proxy)

Supabase Edge Functions call your NAS **from the cloud**. Many Tailscale Funnel setups work in a browser on your PC but fail from datacenters with:

`tls handshake eof`

That is a known Tailscale Funnel + strict TLS clients issue — **not** a wrong API key.

**Fix:** expose port `8787` with **Cloudflare Tunnel** (reliable public HTTPS). Point Supabase secret `SLICE_API_URL` at that URL instead of `*.ts.net`.

---

## 1. Prerequisites

- Domain **artblu.ro** on Cloudflare (DNS managed by Cloudflare)
- Slice API running on OMV: `curl http://127.0.0.1:8787/health` → `"ok": true`

---

## 2. Install cloudflared on OMV (SSH)

```bash
# Debian/OMV amd64 — adjust if needed: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
sudo dpkg -i /tmp/cloudflared.deb
cloudflared --version
```

---

## 3. Create tunnel (one-time)

```bash
cloudflared tunnel login
cloudflared tunnel create artblu-slice
```

Note the tunnel UUID printed (e.g. `a1b2c3d4-...`).

---

## 4. Config file

```bash
sudo mkdir -p /etc/cloudflared
sudo nano /etc/cloudflared/config.yml
```

```yaml
tunnel: artblu-slice
credentials-file: /root/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: slice.artblu.ro
    service: http://127.0.0.1:8787
  - service: http_status:404
```

Replace `<TUNNEL-UUID>` with your tunnel id. Copy the credentials json path from `~/.cloudflared/` if login ran as root.

---

## 5. DNS (Cloudflare dashboard)

**Zero Trust → Networks → Tunnels → artblu-slice → Public Hostname**

Or CLI:

```bash
cloudflared tunnel route dns artblu-slice slice.artblu.ro
```

---

## 6. Run as service

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
sudo systemctl status cloudflared
```

Test from **phone on cellular** (not home Wi‑Fi):

```bash
curl -s https://slice.artblu.ro/health
```

---

## 7. Update Supabase secret

Dashboard → **Project Settings → Edge Functions → Secrets**:

| Secret | New value |
|--------|-----------|
| `SLICE_API_URL` | `https://slice.artblu.ro` |

Keep `SLICE_API_KEY` unchanged. Wait ~1 minute, then test slice on artblu.ro.

---

## 8. Optional: lock CORS on NAS

In `slice-api/.env` on OMV:

```
CORS_ORIGINS=https://artblu.ro,https://www.artblu.ro,https://nicolaerzv.github.io
```

Then `docker compose up -d` in slice-api folder.

---

## Tailscale Funnel (still OK for manual tests)

You can keep Funnel for SSH/testing from your PC. Supabase should use **Cloudflare** URL for server-to-server calls.

If Funnel breaks entirely, on OMV:

```bash
sudo systemctl restart tailscaled
sudo tailscale funnel reset
sudo tailscale funnel --bg 8787
sudo tailscale funnel status
```

Check logs for `peerapi: ingress: denied` — that means Funnel ingress is broken on the node.
