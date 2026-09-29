-- OPERAVA MailDesk mailbox foundation.
-- Additive/backward-compatible: existing app and Worker can continue using emails.status.

alter table public.emails add column if not exists text_body text;
alter table public.emails add column if not exists reply_to text;
alter table public.emails add column if not exists received_at timestamptz;
alter table public.emails add column if not exists is_read boolean not null default false;
alter table public.emails add column if not exists is_starred boolean not null default false;
alter table public.emails add column if not exists is_archived boolean not null default false;
alter table public.emails add column if not exists is_deleted boolean not null default false;
alter table public.emails add column if not exists thread_id uuid;
alter table public.emails add column if not exists folder_id uuid;

create index if not exists emails_user_flags_idx
  on public.emails (user_id, is_deleted, is_archived, created_at desc);

create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_normalized text not null default '',
  latest_message_at timestamptz,
  message_count integer not null default 0 check (message_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  system_type text check (system_type is null or system_type in ('inbox','sent','drafts','archive','trash')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.emails(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  content_id text,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.emails
    add constraint emails_thread_fk foreign key (user_id, thread_id) references public.threads(user_id, id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.emails
    add constraint emails_folder_fk foreign key (user_id, folder_id) references public.folders(user_id, id) on delete set null;
exception when duplicate_object then null; end $$;

create unique index if not exists threads_user_id_id_idx on public.threads (user_id, id);
create unique index if not exists folders_user_id_id_idx on public.folders (user_id, id);

create index if not exists threads_user_latest_idx on public.threads (user_id, latest_message_at desc);
create index if not exists folders_user_idx on public.folders (user_id);
create index if not exists attachments_email_idx on public.attachments (email_id);

alter table public.threads enable row level security;
alter table public.folders enable row level security;
alter table public.attachments enable row level security;

create policy "Users manage their own threads" on public.threads
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own folders" on public.folders
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage attachments for their messages" on public.attachments
  for all to authenticated
  using (exists (
    select 1 from public.emails
    where emails.id = attachments.email_id and emails.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.emails
    where emails.id = attachments.email_id and emails.user_id = (select auth.uid())
  ));

-- Binary attachment storage/upload is intentionally not created here.
-- Add a Storage bucket/policies only with the attachment API implementation.
