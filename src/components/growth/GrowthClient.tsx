"use client";
import { useCallback, useState } from "react";
import type {
  Activity,
  GrowthInsight,
  GrowthReminderState,
  IdeaBoard,
  JournalEntry,
  NarrativeEntry,
  Profile,
} from "@/types/db";
import { can, roleBlurb } from "@/lib/permissions";
import { InsightsPanel } from "./InsightsPanel";
import { NarrativeBuilder } from "./NarrativeBuilder";
import { JournalSection } from "./JournalSection";
import { ActivitiesBank } from "./ActivitiesBank";
import { IdeasSection } from "./IdeasSection";
import { RemindersSection } from "./RemindersSection";

interface Props {
  profile: Profile;
  studentId: string;
  narrative: NarrativeEntry[];
  activities: Activity[];
  journal: JournalEntry[];
  insights: GrowthInsight | null;
  ideaBoards: IdeaBoard[];
  reminders: GrowthReminderState | null;
  creators: Record<string, { name: string; role: string }>;
}

export function GrowthClient({
  profile,
  narrative,
  activities,
  journal,
  insights,
  ideaBoards,
  reminders,
  creators,
}: Props) {
  const [err, setErr] = useState<string | null>(null);
  // Reminders → Ideas cross-communication. A reminder click sets the
  // signal; IdeasSection picks it up, opens the board, then acks.
  const [openBoardSignal, setOpenBoardSignal] = useState<string | null>(null);

  const canRefresh = can.refreshGrowthInsights(profile.role);
  const canEditNarrative = can.editNarrative(profile.role);
  const canEditActivities = can.editActivities(profile.role);
  const canEditIdeas = can.editIdeas(profile.role);
  const canJournal = can.writeJournal(profile.role);

  const requestOpenBoard = useCallback((id: string) => {
    setOpenBoardSignal(id);
    // Scroll up so the modal isn't opening off-screen.
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  return (
    <div className="space-y-8">
      <header className="pb-2 border-b border-ink-200">
        <h1 className="text-xl font-semibold text-ink-900">成长</h1>
        <p className="text-sm text-ink-500 mt-1 max-w-2xl">
          你是谁、在意什么、要往哪里去。慢慢把这个故事构建起来——系统会综合你的叙事、日志、会谈反思与活动，让整幅画面保持连贯。
        </p>
        <p className="text-xs text-ink-400 mt-1">
          你现在的视角是：<strong>{roleBlurb[profile.role]}</strong>
        </p>
      </header>

      {err ? (
        <div className="card border-rose-300 bg-rose-50 text-rose-700 text-sm p-3">
          {err}
        </div>
      ) : null}

      <section className="space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">
            叙事构建
          </h2>
          <p className="text-xs text-ink-500 max-w-2xl">
            这是你和顾问一起搭建自我认识的空间。AI 会综合这里的内容，加上日志、反思、活动，帮你把整条故事线始终握在手上。
          </p>
        </div>

        <InsightsPanel
          insights={insights}
          canRefresh={canRefresh}
          setErr={setErr}
        />

        <NarrativeBuilder
          entries={narrative}
          canEdit={canEditNarrative}
          creators={creators}
          setErr={setErr}
        />

        {canJournal ? (
          <JournalSection entries={journal} setErr={setErr} />
        ) : (
          <CollaboratorJournalNote />
        )}
      </section>

      <IdeasSection
        boards={ideaBoards}
        canEdit={canEditIdeas}
        creators={creators}
        setErr={setErr}
        openBoardIdSignal={openBoardSignal}
        onOpenBoardIdHandled={() => setOpenBoardSignal(null)}
      />

      <RemindersSection
        state={reminders}
        boards={ideaBoards}
        canRefresh={canEditIdeas}
        setErr={setErr}
        onJumpToBoard={requestOpenBoard}
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">活动档案</h2>
          <p className="text-xs text-ink-500 max-w-2xl">
            每个活动都会记录你做了什么、为什么做、从中学到了什么，以及它如何融入你的叙事。AI 能围绕你的主题，用 2–3 句话帮每个活动找到定位。
          </p>
        </div>
        <ActivitiesBank
          activities={activities}
          canEdit={canEditActivities}
          creators={creators}
          setErr={setErr}
        />
      </section>
    </div>
  );
}

function CollaboratorJournalNote() {
  return (
    <div className="card p-3 text-xs text-ink-500 bg-ink-50 italic">
      学生的日志是私人的。AI 在综合洞察时会在内部读取，但原文不会展示给顾问或家长。
    </div>
  );
}
