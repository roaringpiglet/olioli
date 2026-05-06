-- ======================================================================
-- College Application OS — multi-track timeline
--
-- Apply this AFTER 0001_initial.sql. Adds the timeline_items table that
-- powers /timeline. Items are higher-level than weekly_todos: each is
-- scoped to one of six tracks and can span days, weeks, or months.
-- ======================================================================

create type public.timeline_track as enum (
    'academic',
    'testing',
    'extracurriculars',
    'portfolio',
    'college_application',
    'personal_development'
);

create type public.timeline_status as enum (
    'planned',
    'active',
    'done'
);

create table if not exists public.timeline_items (
    id               uuid primary key default gen_random_uuid(),
    student_id       uuid not null references public.profiles(id) on delete cascade,
    track            public.timeline_track not null,
    title            text not null,
    description      text,
    start_date       date not null,
    end_date         date not null,
    status           public.timeline_status not null default 'planned',
    -- Optional cross-link to a monthly goal so the dashboard and timeline
    -- can reference each other; not required.
    monthly_goal_id  uuid references public.monthly_goals(id) on delete set null,
    created_by       uuid references public.profiles(id),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    check (end_date >= start_date)
);

create index if not exists timeline_items_student_track_idx
    on public.timeline_items(student_id, track, start_date);
create index if not exists timeline_items_student_range_idx
    on public.timeline_items(student_id, start_date, end_date);

alter table public.timeline_items enable row level security;

-- Reuse the helpers from 0001 (can_view_student, current_role, is_approved).

drop policy if exists timeline_items_read on public.timeline_items;
create policy timeline_items_read on public.timeline_items
    for select using (public.can_view_student(student_id));

drop policy if exists timeline_items_counselor_write on public.timeline_items;
create policy timeline_items_counselor_write on public.timeline_items
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

-- Auto-touch updated_at (function defined in 0001).
drop trigger if exists timeline_items_touch on public.timeline_items;
create trigger timeline_items_touch before update on public.timeline_items
    for each row execute function public.tg_touch_updated_at();
