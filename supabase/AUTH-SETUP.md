# Fix auth emails (localhost + Supabase branding)

**The link `http://localhost:3000/?code=...` means Supabase Site URL is still localhost.**  
Our website code cannot override this — you must change it in the Supabase Dashboard.

Old emails will **always** point to localhost. After fixing Supabase, request a **new** confirmation email.

---

## Step 1 — Site URL (fixes localhost links)

1. Go to https://supabase.com/dashboard  
2. Open project **tilfngrtldwevtiilxpq**  
3. **Authentication** → **URL Configuration**  
4. Set **Site URL** exactly to:

```
https://nicolaerzv.github.io/3d-Print-Website
```

5. Click **Save**

If Site URL stays `http://localhost:3000`, every email link will keep opening localhost.

---

## Step 2 — Redirect URLs (allowlist)

Same page, **Redirect URLs** — add these lines (keep existing ones only if you use them locally):

```
https://nicolaerzv.github.io/3d-Print-Website/auth-callback.html
https://nicolaerzv.github.io/3d-Print-Website/login.html
https://nicolaerzv.github.io/3d-Print-Website/**
```

Click **Save**.

Without `auth-callback.html` in this list, Supabase ignores our redirect and falls back to Site URL.

---

## Step 3 — Deploy site code

Push to GitHub so Pages has:

- `auth.js` (SITE_URL + redirect to `auth-callback.html`)
- `auth-callback.html` (handles `?code=` from email)

---

## Step 4 — New confirmation email

1. Open https://nicolaerzv.github.io/3d-Print-Website/login.html  
2. Click **Retrimite email de confirmare**  
3. Enter your email  
4. Open the **new** email (ignore old ones)

The new link should look like:

```
https://nicolaerzv.github.io/3d-Print-Website/auth-callback.html?code=...
```

Not localhost.

---

## Step 5 — Rename emails (artblu instead of Supabase)

### Quick (subject + body text)

**Authentication** → **Email Templates**

**Confirm signup** — Subject:
```
Confirmă contul tău artblu
```

Body (keep the link variable):
```html
<h2>Bine ai venit la artblu!</h2>
<p>Apasă linkul de mai jos pentru a confirma emailul:</p>
<p><a href="{{ .ConfirmationURL }}">Confirmă contul</a></p>
<p>Dacă nu ai creat cont, ignoră acest email.</p>
```

**Reset password** — Subject:
```
Resetează parola artblu
```

Body (TokenHash = works on any phone/browser, not only the one that requested the email):
```html
<h2>Resetare parolă artblu</h2>
<p>Apasă linkul de mai jos pentru a alege o parolă nouă:</p>
<p><a href="{{ .SiteURL }}/auth-callback.html?token_hash={{ .TokenHash }}&type=recovery">Alege o parolă nouă</a></p>
<p>Dacă nu ai cerut resetarea, ignoră acest email.</p>
```

**Confirm signup** — prefer the same TokenHash pattern if confirmation fails across devices:
```html
<h2>Bine ai venit la artblu!</h2>
<p><a href="{{ .SiteURL }}/auth-callback.html?token_hash={{ .TokenHash }}&type=signup">Confirmă contul</a></p>
```

> Do **not** rely only on `{{ .ConfirmationURL }}` for reset if users open mail on their phone after requesting from desktop — that PKCE `?code=` link needs the same browser.

**Project Settings** → **General** → **Project name** → `artblu`

### Full custom sender (SMTP)

See **`supabase/SMTP-SETUP.md`** for step-by-step (Resend, Brevo, SendGrid, hosting email).

Quick path: **Authentication** → **Emails** → **SMTP Settings** → enable Custom SMTP.

---

## Stuck unconfirmed account

Dashboard → **Authentication** → **Users** → your email → either:

- **Confirm user** (instant fix), or  
- **Delete user** → register again after Steps 1–4

---

## Admin panel (`admin.html`)

Requires login. Only emails listed in `ADMIN_EMAILS` inside `auth.js` (or users with `app_metadata.role = "admin"` in Supabase) can open the panel.

Add your admin email(s) in lowercase:

```js
const ADMIN_EMAILS = [
  'contact@artblu.ro',
  'you@example.com'
];
```

Unauthenticated visitors are sent to `login.html?redirect=admin.html` and return after sign-in.

---

## Session persistence (stay logged in)

`auth.js` uses one shared Supabase client (`window.artbluAuth`) with `persistSession: true` and `localStorage`. All pages (`index.html`, `checkout.js`, `admin.html`, `account.html`) must use `window.artbluAuth` — not a second `createClient()`.

Users stay signed in across visits until they sign out or the refresh token expires (weeks/months, per Supabase project settings).

---

## Checklist

- [ ] Site URL = `https://artblu.ro` (NOT localhost)  
- [ ] Redirect URLs include `https://artblu.ro/auth-callback.html`  
- [ ] Latest code deployed  
- [ ] **Reset password** email template uses `token_hash` + `type=recovery` (see Step 5)  
- [ ] Requested **new** reset/confirmation email (old links are useless)  
- [ ] Email templates updated to artblu wording  
- [ ] Your email added to `ADMIN_EMAILS` in `auth.js`
