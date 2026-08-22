-- Run in Supabase SQL Editor.
-- Admin toggles: free shipping for everyone + enable/disable storefront payments.

alter table public.pricing_settings
  add column if not exists shipping_free boolean not null default false,
  add column if not exists payments_enabled boolean not null default true;

update public.pricing_settings
set
  shipping_free = coalesce(shipping_free, false),
  payments_enabled = coalesce(payments_enabled, true)
where id = 1;

comment on column public.pricing_settings.shipping_free is 'When true, shipping fee is always 0 on the storefront';
comment on column public.pricing_settings.payments_enabled is 'When false, checkout/custom pay is blocked and WIP message is shown';
