"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  GrowthInsight,
  Recommendation,
  RecommendationKind,
} from "@/types/db";

interface Props {
  insights: GrowthInsight | null;
  canRefresh: boolean;
  setErr: (e: string | null) => void;
}

export function InsightsPanel({ insights, canRefresh, setErr }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fresh, setFresh] = useState<GrowthInsight | null>(null);

  const data = fresh ?? insights;

  const refresh = () => {
    setErr(null);
    start(async () => {
      try {
        const res = await fetch("/api/ai/growth-insights", { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "综合失败，请稍后再试。");
        setFresh({
          student_id: insights?.student_id ?? "",
          headline: json.headline ?? null,
          emerging_themes: json.emerging_themes ?? [],
          value_patterns: json.value_patterns ?? [],
          narrative_directions: json.narrative_directions ?? [],
          growth_areas: json.growth_areas ?? [],
          recommendations: json.recommendations ?? [],
          generated_at: json.generated_at ?? new Date().toISOString(),
          generated_by: insights?.generated_by ?? null,
        });
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  if (!data) {
    return (
      <div className="card p-4 bg-gradient-to-br from-brand-50 to-white border-brand-200">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-ink-900">
              AI 综合
            </div>
            <p className="text-sm text-ink-600 max-w-xl mt-1">
              还没有综合过。只要有一条叙事记录、一篇日志、一次反思或一个活动，就能帮你勾勒出贯穿其中的线索。
            </p>
          </div>
          {canRefresh ? (
            <button
              className="btn btn-primary"
              disabled={pending}
              onClick={refresh}
            >
              {pending ? "思考中……" : "生成综合洞察"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4 bg-gradient-to-br from-brand-50 to-white border-brand-200 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-brand-700 font-semibold">
            AI 综合
          </div>
          {data.headline ? (
            <p className="text-base font-medium text-ink-900 mt-1">
              {data.headline}
            </p>
          ) : null}
          <p className="text-[11px] text-ink-400 mt-1">
            上次生成：{fmtGenerated(data.generated_at)}
          </p>
        </div>
        {canRefresh ? (
          <button
            className="btn btn-ghost text-xs"
            disabled={pending}
            onClick={refresh}
            title="重新综合所有资料"
          >
            {pending ? "思考中……" : "刷新"}
          </button>
        ) : null}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <InsightBlock title="正在浮现的主题">
          {data.emerging_themes.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-2">
              {data.emerging_themes.map((t, i) => (
                <li key={i} className="text-sm">
                  <div className="font-medium text-ink-900">{t.title}</div>
                  <div className="text-ink-600">{t.evidence}</div>
                </li>
              ))}
            </ul>
          )}
        </InsightBlock>

        <InsightBlock title="逐渐显现的价值观">
          {data.value_patterns.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-2">
              {data.value_patterns.map((v, i) => (
                <li key={i} className="text-sm">
                  <div className="font-medium text-ink-900">{v.value}</div>
                  <div className="text-ink-600">{v.signal}</div>
                </li>
              ))}
            </ul>
          )}
        </InsightBlock>

        <InsightBlock title="叙事方向">
          {data.narrative_directions.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-2">
              {data.narrative_directions.map((d, i) => (
                <li key={i} className="text-sm">
                  <div className="font-medium text-ink-900">{d.direction}</div>
                  <div className="text-ink-600">{d.why}</div>
                </li>
              ))}
            </ul>
          )}
        </InsightBlock>

        <InsightBlock title="值得成长的方向">
          {data.growth_areas.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-2">
              {data.growth_areas.map((g, i) => (
                <li key={i} className="text-sm">
                  <div className="font-medium text-ink-900">{g.area}</div>
                  <div className="text-ink-600">{g.why}</div>
                </li>
              ))}
            </ul>
          )}
        </InsightBlock>
      </div>

      <InsightBlock title="教练式建议">
        {data.recommendations.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-2">
            {data.recommendations.map((r, i) => (
              <RecommendationRow key={i} rec={r} />
            ))}
          </ul>
        )}
      </InsightBlock>
    </div>
  );
}

const KIND_STYLE: Record<RecommendationKind, string> = {
  book: "bg-amber-100 text-amber-800 border-amber-200",
  practice: "bg-emerald-100 text-emerald-800 border-emerald-200",
  conversation: "bg-sky-100 text-sky-800 border-sky-200",
  project: "bg-violet-100 text-violet-800 border-violet-200",
  other: "bg-ink-100 text-ink-700 border-ink-200",
};
const KIND_LABEL: Record<RecommendationKind, string> = {
  book: "阅读",
  practice: "练习",
  conversation: "对话",
  project: "试做",
  other: "行动",
};

function RecommendationRow({ rec }: { rec: Recommendation }) {
  return (
    <li className="text-sm flex gap-2 items-start">
      <span
        className={
          "shrink-0 inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded border uppercase tracking-wider " +
          KIND_STYLE[rec.kind]
        }
      >
        {KIND_LABEL[rec.kind]}
      </span>
      <span className="min-w-0">
        <span className="font-medium text-ink-900">{rec.action}</span>
        <span className="text-ink-600"> — {rec.detail}</span>
      </span>
    </li>
  );
}

function InsightBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white/60 rounded-md p-3 border border-brand-100">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="text-sm text-ink-400 italic">暂未浮现。</div>;
}

function fmtGenerated(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
