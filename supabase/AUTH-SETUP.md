# Auth setup (Supabase)

Account signup/login uses Supabase Auth (email + password).

## Dashboard → Authentication → URL Configuration

Set:

- **Site URL**: your live shop URL (e.g. `https://yoursite.com` or GitHub Pages URL)
- **Redirect URLs** (add all that apply):
  - `http://localhost:.../login.html` (if you test locally)
  - `https://YOUR-DOMAIN/login.html`
  - `https://YOUR-DOMAIN/login.html?confirmed=1`
  - `https://YOUR-DOMAIN/login.html?reset=1`

Without these, confirmation / password-reset links fail or land on the wrong page.

## Email confirmation

Your project currently has **confirm email = ON** (`mailer_autoconfirm: false`).

That means after signup the user must click the email link before login works. To skip confirmation while testing:

Authentication → Providers → Email → disable **Confirm email**.

## SQL for account order history

Run in SQL Editor:

1. `supabase/auth-orders.sql` — adds `orders.user_id` + select policy so the account page can list store orders

Custom prints already store `user_id` when the customer is logged in.

## What works on the site

- Login / register (`login.html`)
- Forgot password + set new password from email link
- Account page: profile name, store orders, custom prints, logout
- Logged-in checkout / custom form prefill + `user_id` on new orders
