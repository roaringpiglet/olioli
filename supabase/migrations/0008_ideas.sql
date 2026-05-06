-- ======================================================================
-- College Application OS — Ideas & options boards
--
-- A flexible "things we're thinking about" surface that sits between
-- Narrative Builder and Activities Bank on the Growth page. The student
-- and counselor create their own named boards ("Summer programs",
-- "Teachers to ask for recs", "Books to read together", "Clubs we're
-- deciding between", etc.) and drop items into each one.
--
-- RLS: counselor / student / manager can edit; parent is read-only.
-- ======================================================================

create table if not exists public.idea_boards (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  description text,
  "order"     int not null default 0,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idea_boards_student_idx
  on public.idea_boards(student_id, "order");

alter table public.idea_boards enable row level security;

drop policy if exists idea_boards_read on public.idea_boards;
create policy idea_boards_read on public.idea_boards
  for select using (public.can_view_student(student_id));

drop policy if exists idea_boards_write on public.idea_boards;
create policy idea_boards_write on public.idea_boards
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'approved'
        and p.role in ('counselor', 'student', 'manager')
        and public.can_view_student(student_id)
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'approved'
        and p.role in ('counselor', 'student', 'manager')
        and public.can_view_student(student_id)
    )
  );

drop trigger if exists idea_boards_touch on public.idea_boards;
create trigger idea_boards_touch before update on public.idea_boards
  for each row execute function public.tg_touch_updated_at();

-- ---------- idea_items ----------
-- student_id is denormalized so the RLS policy can match the same
-- can_view_student predicate without a join.
create table if not exists public.idea_items (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.idea_boards(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  notes       text,
  url         text,
  "order"     int not null default 0,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idea_items_board_idx
  on public.idea_items(board_id, "order");

alter table public.idea_items enable row level security;

drop policy if exists idea_items_read on public.idea_items;
create policy idea_items_read on public.idea_items
  for select using (public.can_view_student(student_id));

drop policy if exists idea_items_write on public.idea_items;
create policy idea_items_write on public.idea_items
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'approved'
        and p.role in ('counselor', 'student', 'manager')
        and public.can_view_student(student_id)
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'approved'
        and p.role in ('counselor', 'student', 'manager')
        and public.can_view_student(student_id)
    )
  );

drop trigger if exists idea_items_touch on public.idea_items;
create trigger idea_items_touch before update on public.idea_items
  for each row execute function public.tg_touch_updated_at();
