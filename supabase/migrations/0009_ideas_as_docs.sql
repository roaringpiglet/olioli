-- ======================================================================
-- College Application OS — Ideas boards as free-text docs + AI reminders
--
-- Changes:
--   1. Each idea_board now has a free-text `content` column. Counselors
--      and students open a board like a mini-doc and type whatever —
--      links, thoughts, deadlines, opinions — instead of adding rigid
--      item rows.
--   2. Existing idea_items are folded into their board's content as a
--      bulleted list, then the idea_items table is dropped.
--   3. New `growth_reminders` table caches AI-extracted reminders
--      (deadlines and things to look at soon) pulled out of the board
--      content.
-- ======================================================================

-- ---------- 1. Add content column + backfill from items ----------
alter table public.idea_boards
  add column if not exists content text;

-- Fold existing items (if any) into their board's content so nothing is
-- lost when we drop the idea_items table below.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'idea_items'
  ) then
    update public.idea_boards b
    set content = coalesce(b.content, '') ||
      case when coalesce(b.content, '') = '' then '' else E'\n\n' end ||
      coalesce(items.block, '')
    from (
      select
        board_id,
        string_agg(
          '- ' || title ||
          case when url is not null and url <> '' then ' (' || url || ')' else '' end ||
          case when notes is not null and notes <> '' then E'\n  ' || notes else '' end,
          E'\n'
          order by "order", created_at
        ) as block
      from public.idea_items
      group by board_id
    ) as items
    where b.id = items.board_id
      and coalesce(items.block, '') <> '';

    drop table public.idea_items;
  end if;
end $$;

-- ---------- 2. growth_reminders cache ----------
-- Single row per student with a jsonb array of extracted reminders.
-- Each reminder shape (see TS type GrowthReminder):
--   { id, title, detail, date, urgency, source_board_id }
create table if not exists public.growth_reminders (
  student_id   uuid primary key references public.profiles(id) on delete cascade,
  reminders    jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  generated_by uuid references public.profiles(id)
);

alter table public.growth_reminders enable row level security;

drop policy if exists growth_reminders_read on public.growth_reminders;
create policy growth_reminders_read on public.growth_reminders
  for select using (public.can_view_student(student_id));

-- Same write audience as idea_boards: counselor / student / manager.
drop policy if exists growth_reminders_write on public.growth_reminders;
create policy growth_reminders_write on public.growth_reminders
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
