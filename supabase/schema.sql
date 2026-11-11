-- THE EXCHANGE: simple two-table Supabase schema
-- Run this entire file in Supabase Dashboard -> SQL Editor.
--
-- This resets the earlier prototype schema. It drops the old profiles,
-- polls, and votes tables (including any vote data in them) and recreates
-- the simplified polls + votes design. Run before adding real polls/votes.

-- Remove objects from the earlier Supabase Auth-based version, if present.
drop trigger if exists on_auth_user_created_league_profile on auth.users;
drop function if exists public.handle_new_league_user();
drop function if exists public.cast_vote(text, text);

-- Reset old prototype tables so the new column names/types are consistent.
drop table if exists public.votes cascade;
drop table if exists public.polls cascade;
drop table if exists public.profiles cascade;

-- One row per poll. Polls are created/resolved manually in Supabase Table Editor.
create table public.polls (
  id text primary key,
  question text not null check (length(trim(question)) > 0),
  excluded jsonb not null default '[]'::jsonb,
  closing_date timestamptz not null,
  description text,
  specifications text,
  options jsonb not null,
  resolved text,
  date_resolved timestamptz,
  created_at timestamptz not null default now(),
  constraint polls_excluded_array check (jsonb_typeof(excluded) = 'array'),
  constraint polls_options_array check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) >= 2
  ),
  constraint polls_resolution_matches_option check (
    resolved is null or options @> jsonb_build_array(resolved)
  ),
  constraint polls_resolution_dates_match check (
    (resolved is null and date_resolved is null)
    or (resolved is not null and date_resolved is not null)
  )
);

-- One row per person's current prediction for one poll.
create table public.votes (
  username text not null,
  poll_id text not null references public.polls(id) on delete cascade,
  choice text not null,
  updated_at timestamptz not null default now(),
  constraint votes_username_poll_id_key primary key (username, poll_id)
);

create index polls_closing_date_idx on public.polls(closing_date);
create index votes_poll_id_idx on public.votes(poll_id);

-- The static site can read polls. Poll creation and resolution stay in the
-- Supabase dashboard; the anonymous browser role cannot edit poll rows.
alter table public.polls enable row level security;
create policy "Public can read polls"
on public.polls for select
to anon, authenticated
using (true);

-- Deliberately simple for a six-friend joke game: the client-side login is
-- not real authentication, so anyone with the public key can read/write votes.
alter table public.votes enable row level security;
create policy "Public can read votes"
on public.votes for select
to anon, authenticated
using (true);
create policy "Public can insert votes"
on public.votes for insert
to anon, authenticated
with check (true);
create policy "Public can update votes"
on public.votes for update
to anon, authenticated
using (true)
with check (true);

grant usage on schema public to anon, authenticated;
grant select on public.polls to anon, authenticated;
grant select, insert, update on public.votes to anon, authenticated;
revoke insert, update, delete on public.polls from anon, authenticated;
revoke delete on public.votes from anon, authenticated;
