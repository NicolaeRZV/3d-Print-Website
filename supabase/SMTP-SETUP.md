# Custom SMTP for artblu (Supabase Auth emails)

Supabase’s built-in email is for testing only (~2 emails/hour, “Supabase” sender). For production use **custom SMTP** so emails come from e.g. `contact@artblu.ro` or `no-reply@artblu.ro`.

Official docs: https://supabase.com/docs/guides/auth/auth-smtp

---

## Overview

1. Pick an email provider (Resend recommended — simple + free tier).
2. Verify your domain (`artblu.ro`) with DNS records.
3. Paste SMTP credentials into Supabase.
4. Update email templates + send a test.

---

## Option A — Resend (recommended)

Good for small shops. Free tier includes transactional email.

### 1. Create Resend account

https://resend.com → sign up.

### 2. Add domain

1. Resend dashboard → **Domains** → **Add domain**
2. Enter `artblu.ro` (or subdomain like `mail.artblu.ro`)
3. Resend shows DNS records — add them where you manage DNS (GoDaddy, Cloudflare, etc.):

   | Type | Purpose |
   |------|---------|
   | TXT | SPF |
   | CNAME | DKIM (usually 2–3 records) |

4. Wait until Resend shows **Verified** (can take a few minutes up to 48h).

### 3. Create API key

Resend → **API Keys** → **Create** → copy key (starts with `re_`).

### 4. Supabase SMTP settings

1. https://supabase.com/dashboard → project **tilfngrtldwevtiilxpq**
2. **Authentication** → **Emails** → **SMTP Settings** tab  
   (or direct: Project → Authentication → scroll to SMTP)
3. Enable **Custom SMTP**
4. Fill in:

   | Field | Value |
   |-------|--------|
   | **Sender email** | `no-reply@artblu.ro` (must be on verified domain) |
   | **Sender name** | `artblu` |
   | **Host** | `smtp.resend.com` |
   | **Port** | `465` |
   | **Username** | `resend` |
   | **Password** | your Resend API key (`re_...`) |

5. **Save** — no spaces before/after Host (causes DNS errors).

### 5. Raise email rate limit (optional)

**Authentication** → **Rate Limits** → increase **Email sent** (default after SMTP is often 30/hour; adjust for your traffic).

### 6. Test

1. Fix **Site URL** first (see `AUTH-SETUP.md`) — otherwise links still break.
2. `login.html` → **Retrimite email de confirmare** with your real email.
3. Check inbox + spam. Sender should show **artblu** / `no-reply@artblu.ro`.

---

## Option B — Brevo (Sendinblue)

Popular in EU/Romania.

1. https://www.brevo.com → account → **SMTP & API**
2. Create SMTP key
3. Verify sender/domain
4. Supabase settings:

   | Field | Value |
   |-------|--------|
   | Host | `smtp-relay.brevo.com` |
   | Port | `587` |
   | Username | your Brevo login email |
   | Password | SMTP key (not account password) |
   | Sender email | verified address on your domain |

---

## Option C — SendGrid

1. https://sendgrid.com → **Settings** → **API Keys**
2. Verify domain (Sender Authentication)
3. Supabase:

   | Field | Value |
   |-------|--------|
   | Host | `smtp.sendgrid.net` |
   | Port | `587` |
   | Username | `apikey` |
   | Password | your SendGrid API key (`SG....`) |
   | Sender email | verified sender |

---

## Option D — Email from your hosting (cPanel / Zoho / Google Workspace)

If you already have `contact@artblu.ro` from your domain host:

Use their SMTP details (usually in hosting panel → Email → SMTP):

| Field | Typical values |
|-------|----------------|
| Host | `mail.artblu.ro` or host’s SMTP server |
| Port | `587` (TLS) or `465` (SSL) |
| Username | full email `contact@artblu.ro` |
| Password | mailbox password |
| Sender email | same address |

**Note:** Shared hosting SMTP sometimes has low limits or poor deliverability. Resend/Brevo is usually better for auth emails.

---

## Email templates (after SMTP works)

**Authentication** → **Emails** → **Templates**

Update **Confirm signup** and **Reset password** — subject + body in Romanian (examples in `AUTH-SETUP.md`).  
Always keep `{{ .ConfirmationURL }}` in the body — that’s the confirm/reset link.

---

## Checklist

- [ ] Domain verified at SMTP provider (SPF/DKIM green)
- [ ] Custom SMTP enabled in Supabase
- [ ] Sender email uses verified domain (`@artblu.ro`)
- [ ] Site URL + Redirect URLs fixed (`AUTH-SETUP.md`)
- [ ] Test email received; link opens GitHub Pages (not localhost)
- [ ] Templates say “artblu” not “Supabase”

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Emails not arriving | Check Supabase **Logs** → Auth; verify DNS at provider |
| Still says Supabase | Custom SMTP not saved/enabled; or old email cached |
| Link still localhost | **Site URL** in Supabase still `localhost` — fix URL Configuration |
| `DNS lookup` / SMTP error | Trim spaces from Host field; double-check port 465 vs 587 |
| Goes to spam | Complete DKIM + SPF; use consistent From address; avoid spammy subject lines |
| Rate limit | Authentication → Rate Limits; upgrade provider plan if needed |

---

## Don’t have artblu.ro yet?

You can still use Resend’s test domain for development, but recipients may need to be on your Resend account allowlist. For real customers, verify `artblu.ro` (or your shop domain) before launch.
