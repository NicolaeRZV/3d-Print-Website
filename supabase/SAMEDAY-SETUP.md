# Sameday Easybox (Locker Plugin) setup

Checkout uses the official **Sameday Locker Plugin** map so customers pick a real Easybox.

Docs: https://cdn.sameday.ro/locker-plugin/techdoc.html  
Script: `https://cdn.sameday.ro/locker-plugin/lockerpluginsdk.js`

## What you need from Sameday

1. Ask Sameday for a **Locker Plugin `clientId`** (UUID for your integrator account).
2. Your LM API **`apiUsername`** (same username you use for the courier API).
3. Optional later (AWB generation): API password — store only as a Supabase secret, never in the frontend.

## Where to put credentials

In [`checkout.js`](../checkout.js):

```js
const SAMEDAY_CLIENT_ID = 'your-client-id-uuid';
const SAMEDAY_API_USERNAME = 'your-lm-username';
const SAMEDAY_DEFAULT_CITY = 'Bucuresti';
const SAMEDAY_DEFAULT_COUNTY = 'Bucuresti';
```

Until these are set, **home delivery still works**. The Easybox button shows a configuration toast.

## Database

Run once in Supabase SQL Editor:

- `supabase/checkout-shipping.sql` — Easybox price + locker columns on `orders` / `custom_prints`

Admin → Formula: set **Taxă livrare acasă** and **Taxă Easybox** separately.

## Flow

1. Customer chooses **Easybox Sameday** on `checkout.html`.
2. Clicks **Alege easybox pe hartă** → Locker Plugin modal.
3. Selected locker (`lockerId`, name, address, city, county) is saved on the order.
4. `customer_address` is stored as `Easybox: {name}, {address}, {city}` for admin/Discord compatibility.

## Not in this release

Automatic AWB creation via `POST /api/awb`. Locker ID is stored so you can generate AWBs later from admin or an Edge Function using server-side Sameday credentials.

## Redeploy Stripe function

After pulling these changes:

```bash
supabase functions deploy create-checkout
```

The function uses `shipping_method` + `shipping_easybox` / `shipping_flat` when building the Stripe total.
