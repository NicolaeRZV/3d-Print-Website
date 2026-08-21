# Stripe + shipping (artblu)

## Prices (RON) — set so you don’t lose money

| Fee | Amount | Why |
|-----|--------|-----|
| Livrare | **25 lei** | Typical Fan/Cargus home delivery is ~18–25 lei; buffer for remote counties |
| Livrare gratuită | peste **250 lei** | Only when order margin can absorb shipping |
| Taxă ramburs | **8 lei** | Courier COD fee + handling |

Editable later in Supabase `pricing_settings`: `shipping_flat`, `free_shipping_over`, `cod_fee`.

## 1. SQL

Run in Supabase SQL Editor:

`supabase/payments.sql`

## 2. Stripe account

1. Create account at https://dashboard.stripe.com  
2. Activate **RON** payments  
3. Developers → API keys → copy **Secret key** (`sk_test_…` then later `sk_live_…`)

## 3. Deploy Edge Functions

```bash
# once
npm i -g supabase
supabase login
supabase link --project-ref tilfngrtldwevtiilxpq

supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
supabase secrets set SITE_URL=https://YOUR-SITE-DOMAIN

supabase functions deploy create-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
```

## 4. Stripe webhook

1. Stripe Dashboard → Developers → Webhooks → Add endpoint  
2. URL: `https://tilfngrtldwevtiilxpq.supabase.co/functions/v1/stripe-webhook`  
3. Event: `checkout.session.completed`  
4. Copy signing secret →  

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
```

## 5. Site

`index.html` already uses:

- Payment method: **Card (Stripe)** / **Ramburs**
- `shipping.js` for totals
- `create-checkout` for card redirect

Set `SITE_URL` to your real storefront origin (GitHub Pages / custom domain).

## Test

1. Card: use Stripe test card `4242 4242 4242 4242`  
2. Confirm `payment_status = paid` on the order after webhook  
3. Ramburs: order stays `unpaid_cod`, total includes +8 lei  

## Go live

Replace test keys with live keys, update webhook to live mode, re-set secrets.
