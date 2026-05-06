-- ======================================================================
-- College Application OS — Meeting topics backlog
--
-- A shared inbox of things to discuss. Anyone linked to the student
-- (counselor, student, parent, manager) can add/edit/remove a topic.
-- When a topic is folded into a new meeting, we link it and flip its
-- status to 'scheduled'; when that meeting is marked completed, the
-- topic auto-completes. Cancelling the meeting reopens its topics.
-- ======================================================================

create type public.topic_status as enum ('open', 'scheduled', 'completed');

create table if not exists public.meeting_topics (
  id                    uuid primary key default gen_random_uuid(),
  student_id            uuid not null references public.profiles(id) on delete cascade,
  title                 text not null,
  notes                 text,
  duration_minutes      int,
  status                public.topic_status not null default 'open',
  scheduled_meeting_id  uuid references public.meetings(id) on delete set null,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists meeting_topics_student_status_idx
  on public.meeting_topics(student_id, status);
create index if not exists meeting_topics_scheduled_idx
  on public.meeting_topics(scheduled_meeting_id);

alter table public.meeting_topics enable row level security;

drop policy if exists meeting_topics_read on public.meeting_topics;
create policy meeting_topics_read on public.meeting_topics
  for select using (public.can_view_student(student_id));

-- Any approved user who can view the student can add/edit/delete topics.
-- This is a shared backlog by design — student, counselor, and parent
-- can all drop items into it.
drop policy if exists meeting_topics_write on public.meeting_topics;
create policy meeting_topics_write on public.meeting_topics
  for all using (public.can_view_student(student_id))
  with check (public.can_view_student(student_id));

drop trigger if exists meeting_topics_touch on public.meeting_topics;
create trigger meeting_topics_touch before update on public.meeting_topics
  for each row execute function public.tg_touch_updated_at();
