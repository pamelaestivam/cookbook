-- Cookbook schema: each user has a cookbook; an import (a video link or a set
-- of screenshots) is queued by the app, claimed by the worker, and turned
-- into one or more recipes.

create extension if not exists pgcrypto;

-- Cookbooks ------------------------------------------------------------------

create table public.cookbooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Recipe Book',
  subtitle text not null default 'A growing collection of recipes worth making again.',
  -- Language recipes are written in, whatever language the video uses.
  language text not null default 'English',
  created_at timestamptz not null default now()
);

create index cookbooks_owner_id_idx on public.cookbooks (owner_id);

-- Every new user starts with an empty cookbook.
create function public.create_default_cookbook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cookbooks (owner_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_default_cookbook();

-- Imports --------------------------------------------------------------------

create type public.import_kind as enum ('video', 'images');
create type public.import_status as enum ('queued', 'processing', 'done', 'failed');

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cookbook_id uuid not null references public.cookbooks (id) on delete cascade,
  kind public.import_kind not null,
  source_url text,
  -- Paths in the "uploads" storage bucket, in the order the user picked them.
  image_paths text[] not null default '{}',
  status public.import_status not null default 'queued',
  -- Short progress message shown in the app while processing.
  progress text,
  -- Message shown to the user when status = 'failed'.
  error text,
  attempts int not null default 0,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint imports_source_check check (
    (kind = 'video' and source_url is not null)
    or (kind = 'images' and cardinality(image_paths) between 1 and 20)
  )
);

create index imports_owner_id_idx on public.imports (owner_id, created_at desc);
create index imports_queue_idx on public.imports (created_at) where status in ('queued', 'processing');

-- Recipes --------------------------------------------------------------------

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  cookbook_id uuid not null references public.cookbooks (id) on delete cascade,
  import_id uuid references public.imports (id) on delete set null,
  title text not null,
  category text,
  -- Chapter order in the contents.
  position int not null,
  source_url text,
  source_platform text,
  source_author text,
  -- Path in the "covers" storage bucket.
  cover_path text,
  -- The full chapter (ingredients, method, notes...); see worker/src/recipe-schema.ts.
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_cookbook_idx on public.recipes (cookbook_id, position);
create index recipes_import_id_idx on public.recipes (import_id);

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger imports_touch before update on public.imports
  for each row execute function public.touch_updated_at();
create trigger recipes_touch before update on public.recipes
  for each row execute function public.touch_updated_at();

-- Row level security ---------------------------------------------------------

alter table public.cookbooks enable row level security;
alter table public.imports enable row level security;
alter table public.recipes enable row level security;

create policy "Own cookbooks are readable" on public.cookbooks
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Own cookbooks are editable" on public.cookbooks
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "Own imports are readable" on public.imports
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Users queue imports into their cookbooks" on public.imports
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and status = 'queued'
    and attempts = 0
    and exists (select 1 from public.cookbooks c where c.id = cookbook_id and c.owner_id = (select auth.uid()))
    -- Screenshots must live in the user's own folder.
    and not exists (select 1 from unnest(image_paths) p where p not like (select auth.uid())::text || '/%')
  );
create policy "Own imports are deletable" on public.imports
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "Own recipes are readable" on public.recipes
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Own recipes are editable" on public.recipes
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Own recipes are deletable" on public.recipes
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Users may only change what the app edits, never ownership or provenance.
revoke update on public.cookbooks from authenticated;
grant update (title, subtitle, language) on public.cookbooks to authenticated;
revoke update on public.recipes from authenticated;
grant update (title, category, position, content) on public.recipes to authenticated;

-- Worker queue ---------------------------------------------------------------

-- Claims the oldest queued import, or one whose worker died mid-run.
-- Only the worker (service role) may call it.
create function public.claim_next_import()
returns setof public.imports
language sql
security definer
set search_path = ''
as $$
  update public.imports i
  set status = 'processing',
      attempts = i.attempts + 1,
      locked_at = now(),
      progress = 'Getting started',
      error = null
  where i.id = (
    select id from public.imports
    where (status = 'queued' or (status = 'processing' and locked_at < now() - interval '20 minutes'))
      and attempts < 3
    order by created_at
    limit 1
    for update skip locked
  )
  returning i.*;
$$;

revoke execute on function public.claim_next_import() from public, anon, authenticated;
grant execute on function public.claim_next_import() to service_role;

-- Realtime: the app watches its imports and recipes change.
alter publication supabase_realtime add table public.imports, public.recipes;

-- Storage --------------------------------------------------------------------

-- uploads: screenshots from the app, stored under "<user id>/...".
-- covers: recipe cover images written by the worker, under "<user id>/...".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('uploads', 'uploads', false, 15728640, array['image/jpeg', 'image/png', 'image/webp']),
  ('covers', 'covers', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Users upload screenshots to their folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users read their screenshots" on storage.objects
  for select to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users read their covers" on storage.objects
  for select to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
