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

Body:
```html
<h2>Resetare parolă artblu</h2>
<p><a href="{{ .ConfirmationURL }}">Alege o parolă nouă</a></p>
```

### Project name (sender label in some clients)

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

## Checklist

- [ ] Site URL = `https://nicolaerzv.github.io/3d-Print-Website` (NOT localhost)  
- [ ] Redirect URLs include `auth-callback.html`  
- [ ] Latest code deployed to GitHub Pages  
- [ ] Requested **new** confirmation email (old links are useless)  
- [ ] Email templates updated to artblu wording  
