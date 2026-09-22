create extension if not exists pgcrypto;

create type public.mailbox_status as enum ('draft', 'queued', 'sent', 'failed', 'archived', 'trash');

create table public.emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resend_id text unique,
  recipient text not null,
  subject text not null default '',
  html text not null default '',
  status public.mailbox_status not null default 'draft',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index emails_user_created_idx on public.emails (user_id, created_at desc);
create index emails_resend_id_idx on public.emails (resend_id) where resend_id is not null;

create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  resend_event_id text not null unique,
  resend_id text,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
create index email_events_resend_id_idx on public.email_events (resend_id, received_at desc);

alter table public.emails enable row level security;
alter table public.email_events enable row level security;

create policy "Users manage their own messages" on public.emails
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users read events for their messages" on public.email_events
  for select to authenticated using (
    exists (select 1 from public.emails where emails.resend_id = email_events.resend_id and emails.user_id = (select auth.uid()))
  );

-- The Worker writes delivery events with the service-role key; no browser write policy exists.
alter publication supabase_realtime add table public.emails;
