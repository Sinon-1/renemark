-- Run this in the Supabase dashboard: SQL Editor > New query.

create table public.presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  scale real not null,
  opacity real not null,
  rotation real not null,
  x real not null,
  y real not null,
  asset_path text,
  created_at timestamptz not null default now()
);

-- Row-level security: each user can only touch their own rows.
alter table public.presets enable row level security;

create policy "Users manage their own presets"
  on public.presets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Private bucket for watermark images.
insert into storage.buckets (id, name, public) values ('watermarks', 'watermarks', false);

-- Files must live in a folder named after the user's id: <user_id>/<file>
create policy "Users manage their own watermark files"
  on storage.objects for all
  using (bucket_id = 'watermarks' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'watermarks' and (storage.foldername(name))[1] = auth.uid()::text);
