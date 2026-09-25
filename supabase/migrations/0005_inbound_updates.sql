-- Inbound messages + Updates (Resend webhook notifications surface)
-- direction: outbound (sent via Resend) | inbound (received via Resend inbound webhook / worker)

alter table public.emails
  add column if not exists direction text not null default 'outbound'
    check (direction in ('outbound', 'inbound'));

alter table public.emails
  add column if not exists from_address text;

create index if not exists emails_user_direction_idx
  on public.emails (user_id, direction, created_at desc);

-- Optional: allow listing email_events through Worker (service role); RLS already has read for owners
