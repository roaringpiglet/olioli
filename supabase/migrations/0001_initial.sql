-- ======================================================================
-- College Application OS — initial schema
--
-- Roles and lifecycle:
--   * profiles.role    — counselor | student | parent | manager
--   * profiles.status  — pending   | approved | rejected
--
-- Scoping: every plan row (stages/monthly_goals/weekly_todos) is tied to a
-- student profile id. Counselors/parents are linked via support_links rows
-- so one counselor can later support multiple students.
-- ======================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------
create table if not exists public.profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    email       text not null unique,
    full_name   text,
    role        text not null check (role in ('counselor','student','parent','manager')),
    status      text not null default 'pending'
                    check (status in ('pending','approved','rejected')),
    -- Counselors/parents note the student they intend to support at signup.
    -- The manager confirms and creates a real support_links row at approval.
    requested_student_email text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists profiles_status_idx on public.profiles(status);
create index if not exists profiles_role_idx   on public.profiles(role);

-- ---------------------------------------------------------------
-- support_links: who can see which student's plan
-- A student always has an implicit link to themselves (handled in code).
-- ---------------------------------------------------------------
create table if not exists public.support_links (
    id            uuid primary key default gen_random_uuid(),
    supporter_id  uuid not null references public.profiles(id) on delete cascade,
    student_id    uuid not null references public.profiles(id) on delete cascade,
    created_at    timestamptz not null default now(),
    unique (supporter_id, student_id)
);

create index if not exists support_links_student_idx   on public.support_links(student_id);
create index if not exists support_links_supporter_idx on public.support_links(supporter_id);

-- ---------------------------------------------------------------
-- stages: the "Stage Overview" card on the dashboard
-- One stage is active for a given date; we pick the row whose
-- [start_date, end_date] contains today.
-- ---------------------------------------------------------------
create table if not exists public.stages (
    id              uuid primary key default gen_random_uuid(),
    student_id      uuid not null references public.profiles(id) on delete cascade,
    title           text not null,
    start_date      date not null,
    end_date        date not null,
    why_it_matters  text,
    focus_areas     jsonb not null default '[]'::jsonb,
    ai_generated    boolean not null default false,
    created_by      uuid references public.profiles(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    check (end_date >= start_date)
);

create index if not exists stages_student_range_idx
    on public.stages(student_id, start_date, end_date);

-- ---------------------------------------------------------------
-- monthly_goals: 3–5 high-level priorities per calendar month
-- ---------------------------------------------------------------
create table if not exists public.monthly_goals (
    id           uuid primary key default gen_random_uuid(),
    student_id   uuid not null references public.profiles(id) on delete cascade,
    month        date not null,  -- first day of the month
    title        text not null,
    description  text,
    "order"      int not null default 0,
    created_by   uuid references public.profiles(id),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index if not exists monthly_goals_student_month_idx
    on public.monthly_goals(student_id, month);

-- ---------------------------------------------------------------
-- weekly_todos: actionable items derived from a monthly goal
-- ---------------------------------------------------------------
create type public.todo_status as enum ('todo','in_progress','done');

create table if not exists public.weekly_todos (
    id                 uuid primary key default gen_random_uuid(),
    student_id         uuid not null references public.profiles(id) on delete cascade,
    week_start         date not null,  -- Monday
    monthly_goal_id    uuid references public.monthly_goals(id) on delete set null,
    title              text not null,
    status             public.todo_status not null default 'todo',
    notes              text,
    "order"            int not null default 0,
    completed_at       timestamptz,
    completed_by       uuid references public.profiles(id),
    created_by         uuid references public.profiles(id),
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

create index if not exists weekly_todos_student_week_idx
    on public.weekly_todos(student_id, week_start);

-- ---------------------------------------------------------------
-- helper functions for RLS policies
-- ---------------------------------------------------------------

-- Is the caller an approved user?
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profiles
         where id = auth.uid() and status = 'approved'
    );
$$;

-- Role of the caller (null if not signed in / no profile).
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select role from public.profiles where id = auth.uid();
$$;

-- Can the caller see plan rows for the given student?
-- Yes if: they ARE the student, they're the manager, or a support_links row exists.
create or replace function public.can_view_student(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select
        public.is_approved() and (
            auth.uid() = sid
         or public.current_role() = 'manager'
         or exists (
                select 1 from public.support_links
                 where supporter_id = auth.uid() and student_id = sid
            )
        );
$$;

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.support_links enable row level security;
alter table public.stages        enable row level security;
alter table public.monthly_goals enable row level security;
alter table public.weekly_todos  enable row level security;

-- profiles: you can always read your own row (so sign-in can check status).
-- Approved users can read profiles they're linked with. Manager sees all.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
    for select using (id = auth.uid());

drop policy if exists profiles_manager_all on public.profiles;
create policy profiles_manager_all on public.profiles
    for all using (public.current_role() = 'manager')
    with check (public.current_role() = 'manager');

drop policy if exists profiles_linked_read on public.profiles;
create policy profiles_linked_read on public.profiles
    for select using (
        public.is_approved() and (
            exists (
                select 1 from public.support_links
                 where (supporter_id = auth.uid() and student_id = profiles.id)
                    or (student_id   = auth.uid() and supporter_id = profiles.id)
            )
        )
    );

-- Users can update their own full_name only. Role/status changes go through
-- the server (service role) during approval.
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
    for update using (id = auth.uid())
    with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid())
                                 and status = (select status from public.profiles where id = auth.uid()));

-- support_links: readable by either side; only manager can write.
drop policy if exists support_links_read on public.support_links;
create policy support_links_read on public.support_links
    for select using (
        public.is_approved() and
        (supporter_id = auth.uid() or student_id = auth.uid()
         or public.current_role() = 'manager')
    );

drop policy if exists support_links_manager_write on public.support_links;
create policy support_links_manager_write on public.support_links
    for all using (public.current_role() = 'manager')
    with check (public.current_role() = 'manager');

-- stages: viewable by anyone who can_view_student; only counselors (linked to
-- that student) or the manager can write.
drop policy if exists stages_read on public.stages;
create policy stages_read on public.stages
    for select using (public.can_view_student(student_id));

drop policy if exists stages_counselor_write on public.stages;
create policy stages_counselor_write on public.stages
    for all using (
        public.is_approved() and (
            public.current_role() = 'manager' or (
                public.current_role() = 'counselor'
                and public.can_view_student(student_id)
            )
        )
    ) with check (
        public.is_approved() and (
            public.current_role() = 'manager' or (
                public.current_role() = 'counselor'
                and public.can_view_student(student_id)
            )
        )
    );

-- monthly_goals: same access model as stages.
drop policy if exists monthly_goals_read on public.monthly_goals;
create policy monthly_goals_read on public.monthly_goals
    for select using (public.can_view_student(student_id));

drop policy if exists monthly_goals_counselor_write on public.monthly_goals;
create policy monthly_goals_counselor_write on public.monthly_goals
    for all using (
        public.is_approved() and (
            public.current_role() = 'manager' or (
                public.current_role() = 'counselor'
                and public.can_view_student(student_id)
            )
        )
    ) with check (
        public.is_approved() and (
            public.current_role() = 'manager' or (
                public.current_role() = 'counselor'
                and public.can_view_student(student_id)
            )
        )
    );

-- weekly_todos:
--   read  — anyone who can view the student
--   insert/delete — counselor (or manager)
--   update — counselor (anything), student (status + notes only). Parent = none.
drop policy if exists weekly_todos_read on public.weekly_todos;
create policy weekly_todos_read on public.weekly_todos
    for select using (public.can_view_student(student_id));

drop policy if exists weekly_todos_counselor_insert on public.weekly_todos;
create policy weekly_todos_counselor_insert on public.weekly_todos
    for insert with check (
        public.is_approved() and (
            public.current_role() = 'manager' or (
                public.current_role() = 'counselor'
                and public.can_view_student(student_id)
            )
        )
    );

drop policy if exists weekly_todos_counselor_delete on public.weekly_todos;
create policy weekly_todos_counselor_delete on public.weekly_todos
    for delete using (
        public.is_approved() and (
            public.current_role() = 'manager' or (
                public.current_role() = 'counselor'
                and public.can_view_student(student_id)
            )
        )
    );

-- Students can update their own todos' status + notes; counselors/managers can update anything.
drop policy if exists weekly_todos_update on public.weekly_todos;
create policy weekly_todos_update on public.weekly_todos
    for update using (
        public.is_approved() and (
            public.current_role() in ('manager','counselor')
            or (public.current_role() = 'student' and auth.uid() = student_id)
        )
    ) with check (
        public.is_approved() and (
            public.current_role() in ('manager','counselor')
            or (public.current_role() = 'student' and auth.uid() = student_id)
        )
    );

-- ---------------------------------------------------------------
-- auto-update updated_at
-- ---------------------------------------------------------------
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists profiles_touch      on public.profiles;
drop trigger if exists stages_touch        on public.stages;
drop trigger if exists monthly_goals_touch on public.monthly_goals;
drop trigger if exists weekly_todos_touch  on public.weekly_todos;

create trigger profiles_touch      before update on public.profiles
    for each row execute function public.tg_touch_updated_at();
create trigger stages_touch        before update on public.stages
    for each row execute function public.tg_touch_updated_at();
create trigger monthly_goals_touch before update on public.monthly_goals
    for each row execute function public.tg_touch_updated_at();
create trigger weekly_todos_touch  before update on public.weekly_todos
    for each row execute function public.tg_touch_updated_at();
