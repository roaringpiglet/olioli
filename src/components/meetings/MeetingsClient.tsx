"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  Meeting,
  MeetingReflection,
  MeetingTopic,
  Profile,
} from "@/types/db";
import { can, roleBlurb } from "@/lib/permissions";
import { fmtMeetingTime } from "@/lib/dates";
import { MeetingModal } from "./MeetingModal";
import { NewMeetingModal } from "./NewMeetingModal";
import { RequestMeetingModal } from "./RequestMeetingModal";
import { TopicsSection } from "./TopicsSection";

interface Props {
  profile: Profile;
  studentId: string;
  meetings: Meeting[];
  reflections: MeetingReflection[];
  topics: MeetingTopic[];
  creators: Record<string, { name: string; role: string }>;
  initialMeetingId: string | null;
}

export function MeetingsClient({
  profile,
  meetings,
  reflections,
  topics,
  creators,
  initialMeetingId,
}: Props) {
  const t = useTranslations();
  const canManage = can.manageMeetings(profile.role);
  const canRequest = can.requestMeeting(profile.role);

  const [openId, setOpenId] = useState<string | null>(initialMeetingId);
  const [creating, setCreating] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const now = Date.now();

  const { requested, upcoming, past, cancelled } = useMemo(() => {
    const requested: Meeting[] = [];
    const upcoming: Meeting[] = [];
    const past: Meeting[] = [];
    const cancelled: Meeting[] = [];
    for (const m of meetings) {
      if (m.status === "requested") requested.push(m);
      else if (m.status === "cancelled" || m.status === "rejected")
        cancelled.push(m);
      else if (m.status === "completed") past.push(m);
      else if (m.scheduled_at && new Date(m.scheduled_at).getTime() < now)
        past.push(m);
      else upcoming.push(m);
    }
    upcoming.sort((a, b) =>
      (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "")
    );
    past.sort((a, b) =>
      (b.scheduled_at ?? "").localeCompare(a.scheduled_at ?? "")
    );
    requested.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return { requested, upcoming, past, cancelled };
  }, [meetings, now]);

  const reflectionsByMeeting = useMemo(() => {
    const m = new Map<string, MeetingReflection[]>();
    for (const r of reflections) {
      const arr = m.get(r.meeting_id);
      if (arr) arr.push(r);
      else m.set(r.meeting_id, [r]);
    }
    return m;
  }, [reflections]);

  const activeMeeting =
    openId != null ? (meetings.find((m) => m.id === openId) ?? null) : null;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">
            {t("meetings.heading")}
          </h1>
          <p className="text-sm text-ink-500 mt-1 max-w-xl">
            对齐真正重要的事。即将召开的会谈有 AI 建议的议程；结束的会谈保留笔记、关键更新，以及学生自己的反思。
          </p>
          <p className="text-[12px] text-ink-400 mt-1">
            你现在的视角是：<strong>{roleBlurb[profile.role]}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          {canManage ? (
            <button
              onClick={() => setCreating(true)}
              className="btn btn-primary"
            >
              {t("meetings.newMeeting")}
            </button>
          ) : null}
          {canRequest ? (
            <button
              onClick={() => setRequesting(true)}
              className="btn btn-primary"
            >
              {t("meetings.requestMeeting")}
            </button>
          ) : null}
        </div>
      </header>

      {err ? (
        <div className="card p-3 text-sm text-rose-700 border-rose-200 bg-rose-50">
          {err}
        </div>
      ) : null}

      {canManage && requested.length > 0 ? (
        <Section
          title="待处理的申请"
          blurb="学生发来的会谈申请——可以确认时间安排，或附上说明拒绝。"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {requested.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                role={profile.role}
                reflectionCount={reflectionsByMeeting.get(m.id)?.length ?? 0}
                onOpen={() => setOpenId(m.id)}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {!canManage && requested.length > 0 ? (
        <Section
          title="待处理的申请"
          blurb="你提交的会谈申请——等待顾问确认时间。"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {requested.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                role={profile.role}
                reflectionCount={reflectionsByMeeting.get(m.id)?.length ?? 0}
                onOpen={() => setOpenId(m.id)}
              />
            ))}
          </div>
        </Section>
      ) : null}

      <Section
        title={t("meetings.upcoming")}
        blurb="已安排的会谈——点击查看议程与详情。"
      >
        {upcoming.length === 0 ? (
          <EmptyRow>{t("meetings.noUpcoming")}</EmptyRow>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                role={profile.role}
                reflectionCount={reflectionsByMeeting.get(m.id)?.length ?? 0}
                onOpen={() => setOpenId(m.id)}
              />
            ))}
          </div>
        )}
      </Section>

      <TopicsSection
        profile={profile}
        topics={topics}
        meetings={meetings}
        creators={creators}
        setErr={setErr}
      />

      <Section
        title={t("meetings.past")}
        blurb="已结束的会谈，含笔记、AI 摘要与学生的私人反思。"
      >
        {past.length === 0 ? (
          <EmptyRow>{t("meetings.noPast")}</EmptyRow>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {past.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                role={profile.role}
                reflectionCount={reflectionsByMeeting.get(m.id)?.length ?? 0}
                onOpen={() => setOpenId(m.id)}
              />
            ))}
          </div>
        )}
      </Section>

      {cancelled.length > 0 ? (
        <Section title="已取消 / 未安排" blurb="留作参考。" muted>
          <div className="grid gap-3 sm:grid-cols-2">
            {cancelled.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                role={profile.role}
                reflectionCount={reflectionsByMeeting.get(m.id)?.length ?? 0}
                onOpen={() => setOpenId(m.id)}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {activeMeeting ? (
        <MeetingModal
          key={activeMeeting.id}
          profile={profile}
          meeting={activeMeeting}
          reflections={reflectionsByMeeting.get(activeMeeting.id) ?? []}
          onClose={() => setOpenId(null)}
          setErr={setErr}
        />
      ) : null}

      {creating ? (
        <NewMeetingModal
          openTopics={topics.filter((t) => t.status === "open")}
          onClose={() => setCreating(false)}
          onCreated={(m) => {
            setCreating(false);
            setOpenId(m.id);
          }}
          setErr={setErr}
        />
      ) : null}

      {requesting ? (
        <RequestMeetingModal
          onClose={() => setRequesting(false)}
          onRequested={() => setRequesting(false)}
          setErr={setErr}
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  blurb,
  children,
  muted,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <section className={muted ? "opacity-80" : ""}>
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        {blurb ? <p className="text-xs text-ink-500">{blurb}</p> : null}
      </div>
      {children}
    </section>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="card p-4 text-sm text-ink-500 italic">{children}</div>
  );
}

function MeetingCard({
  meeting,
  role,
  reflectionCount,
  onOpen,
}: {
  meeting: Meeting;
  role: Profile["role"];
  reflectionCount: number;
  onOpen: () => void;
}) {
  const status = meeting.status;
  const agendaCount = meeting.agenda?.length ?? 0;
  const hasNotes = !!meeting.notes?.trim();
  const suggestionsPending = (meeting.ai_suggestions ?? []).filter(
    (s) => s.status === "pending"
  ).length;

  return (
    <button
      onClick={onOpen}
      className="card p-4 text-left hover:border-brand-300 hover:shadow-md transition group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-ink-500">
            {fmtMeetingTime(meeting.scheduled_at)}
          </div>
          <div className="mt-0.5 font-medium text-ink-900 truncate">
            {meeting.title}
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-2 text-xs text-ink-500 flex flex-wrap gap-x-3 gap-y-1">
        {agendaCount > 0 ? <span>议程 {agendaCount} 条</span> : null}
        {hasNotes ? <span>有笔记</span> : null}
        {suggestionsPending > 0 ? (
          <span className="text-amber-700">
            有 {suggestionsPending} 条 AI 建议待审阅
          </span>
        ) : null}
        {role === "student" && reflectionCount > 0 ? (
          <span className="text-ink-500">反思 {reflectionCount} 条</span>
        ) : null}
        {meeting.meeting_link ? <span>有链接</span> : null}
      </div>

      {meeting.request_topic && status === "requested" ? (
        <div className="mt-2 text-xs text-ink-600 line-clamp-2">
          <span className="text-ink-400">申请内容：</span>
          {meeting.request_topic}
        </div>
      ) : null}
    </button>
  );
}

function StatusBadge({ status }: { status: Meeting["status"] }) {
  const map: Record<Meeting["status"], { label: string; cls: string }> = {
    requested: { label: "待确认", cls: "bg-amber-100 text-amber-800" },
    scheduled: { label: "已安排", cls: "bg-brand-100 text-brand-700" },
    completed: { label: "已结束", cls: "bg-emerald-100 text-emerald-800" },
    cancelled: { label: "已取消", cls: "bg-ink-100 text-ink-600" },
    rejected: { label: "已拒绝", cls: "bg-rose-100 text-rose-700" },
  };
  const s = map[status];
  return <span className={`chip ${s.cls} shrink-0`}>{s.label}</span>;
}
