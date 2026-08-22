-- Filament + color catalog for storefront (stored on pricing_settings row).
-- Run in Supabase SQL Editor after pricing-settings.sql

alter table public.pricing_settings
  add column if not exists filament_catalog jsonb;

alter table public.custom_prints
  add column if not exists color_style jsonb;

comment on column public.pricing_settings.filament_catalog is 'Admin-managed filaments and per-filament colors (solid + gradient)';
comment on column public.custom_prints.color_style is 'Color metadata: solid/gradient stops, stackable effects (glow, wood, silver, matte)';
