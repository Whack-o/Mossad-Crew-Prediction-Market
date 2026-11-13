-- Run this once on an EXISTING The Exchange database to allow poll creation
-- from create.html. It does not drop or modify existing polls or votes.

drop policy if exists "Public can create polls" on public.polls;
create policy "Public can create polls"
on public.polls for insert
to anon, authenticated
with check (
  length(trim(id)) > 0
  and length(trim(question)) > 0
  and jsonb_typeof(excluded) = 'array'
  and jsonb_typeof(options) = 'array'
  and jsonb_array_length(options) >= 2
  and closing_date > now()
  and resolved is null
  and date_resolved is null
);

grant insert on public.polls to anon, authenticated;
