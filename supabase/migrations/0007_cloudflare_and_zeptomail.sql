-- Migration 0007: Cloudflare & ZeptoMail delivery and routing integration
-- Records ZeptoMail identifier and inbound email routing compatibility

alter table public.emails
  add column if not exists zepto_id text;

create index if not exists emails_zepto_id_idx
  on public.emails (zepto_id) where zepto_id is not null;
