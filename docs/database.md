# OPERAVA MailDesk Database

## Migration order
- 0001_maildesk.sql — core emails, email_events, mailbox_status, RLS, Realtime publication.
- 0005_inbound_updates.sql — inbound/outbound direction and from_address.
- 0006_mailbox_foundation.sql — mailbox flags plus thread/folder/attachment foundations.

Always apply migrations in a non-production environment first.

## Ownership
`emails.user_id`, `threads.user_id`, and `folders.user_id` reference `auth.users(id)`. RLS policies compare ownership with `auth.uid()`.

## Current compatibility
The original `emails.status` remains in place for the existing UI. New mailbox flags separate user organization state from delivery state without breaking current records.

## Foundations
`threads`, `folders`, and `attachments` are schema foundations. Their existence does not mean corresponding UI/API workflows are live.

## Realtime
`emails` is in the Supabase Realtime publication. Browser subscription remains planned until implemented in frontend source.
