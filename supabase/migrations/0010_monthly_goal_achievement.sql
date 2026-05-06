-- 0010_monthly_goal_achievement.sql
--
-- Let students mark "我们达成了这条目标吗" alongside counselors. Up to now
-- monthly_goals had a hard counselor/manager-only RLS policy (FOR ALL).
--
-- We do two things:
--   1. Add achieved_at / achieved_by columns so we can show *who* marked it
--      and *when* — same pattern as weekly_todos.completed_*.
--   2. Replace the single counselor-only write policy with three: insert /
--      delete stay counselor+manager; update opens to the student on their
--      own row. The server action is still the gatekeeper that decides
--      *which fields* a student can change (only achievement state).

alter table public.monthly_goals
    add column if not exists achieved_at timestamptz,
    add column if not exists achieved_by uuid references public.profiles(id) on delete set null;

create index if not exists monthly_goals_achieved_idx
    on public.monthly_goals (student_id, achieved_at);

drop policy if exists monthly_goals_counselor_write on public.monthly_goals;

drop policy if exists monthly_goals_counselor_insert on public.monthly_goals;
create policy monthly_goals_counselor_insert on public.monthly_goals
    for insert with check (
        public.is_approved() and (
            public.current_role() = 'manager' or (
                public.current_role() = 'counselor'
                and public.can_view_student(student_id)
            )
        )
    );

drop policy if exists monthly_goals_counselor_delete on public.monthly_goals;
create policy monthly_goals_counselor_delete on public.monthly_goals
    for delete using (
        public.is_approved() and (
            public.current_role() = 'manager' or (
                public.current_role() = 'counselor'
                and public.can_view_student(student_id)
            )
        )
    );

-- Counselor/manager can update anything; the linked student can update
-- their own row. Field-level restrictions (students only flipping
-- achievement) are enforced in src/app/actions/goals.ts.
drop policy if exists monthly_goals_update on public.monthly_goals;
create policy monthly_goals_update on public.monthly_goals
    for update using (
        public.is_approved() and (
            public.current_role() in ('manager', 'counselor')
            or (public.current_role() = 'student' and auth.uid() = student_id)
        )
    ) with check (
        public.is_approved() and (
            public.current_role() in ('manager', 'counselor')
            or (public.current_role() = 'student' and auth.uid() = student_id)
        )
    );
