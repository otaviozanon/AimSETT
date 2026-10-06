import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { fmtMs } from "./useAimTrainer";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from "recharts";

function stdDev(values, avg) {
  if (values.length < 2) return 0;
  const variance =
    values.reduce((a, v) => a + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Post-match analysis: reaction-time trend across shots and a hit/miss
// timeline, plus aggregate stats (avg/median/best/worst/consistency).
export default function MatchAnalytics({ history, mode }) {
  const { t } = useTranslation();
  const isTracking = mode === "tracking";
  const reactionLabel = isTracking
    ? t("acquisitionPerTarget")
    : t("reactionPerHit");
  const hits = useMemo(
    () => history.filter((h) => h.type === "hit"),
    [history],
  );

  const reactionSeries = useMemo(
    () =>
      hits.map((h, i) => ({ shot: i + 1, reaction: Math.round(h.reaction) })),
    [hits],
  );

  // Fixed-height bars (all equal) in sequence order, colored by outcome —
  // reads like a barcode: easy to spot streaks/misses at a glance, unlike a
  // scatter flattened onto two y-levels which doesn't communicate anything
  // beyond "hit or miss happened at roughly this time".
  const timeline = useMemo(
    () =>
      history.map((h, i) => ({
        shot: i + 1,
        t: Math.round(h.t / 100) / 10,
        y: 1,
        type: h.type,
      })),
    [history],
  );

  // Running accuracy — cumulative hit% after each shot. Surfaces trends
  // like "started strong, faded near the end" that no other chart here
  // shows.
  const runningAccuracy = useMemo(() => {
    let hitCount = 0;
    return history.map((h, i) => {
      if (h.type === "hit") hitCount += 1;
      return {
        shot: i + 1,
        accuracy: Math.round((hitCount / (i + 1)) * 100),
      };
    });
  }, [history]);

  const metrics = useMemo(() => {
    const times = hits.map((h) => h.reaction);
    if (times.length === 0) {
      return { avg: 0, median: 0, best: 0, worst: 0, consistency: 0 };
    }
    const sorted = [...times].sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    return {
      avg: Math.round(avg),
      median: Math.round(median),
      best: Math.round(sorted[0]),
      worst: Math.round(sorted[sorted.length - 1]),
      consistency: Math.round(stdDev(times, avg)),
    };
  }, [hits]);

  // On very small screens, showing all charts stacked forces a scrollbar on
  // the results card. Instead, show one chart at a time behind tab buttons
  // so the card always fits without scrolling.
  const [isCompact, setIsCompact] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px), (max-height: 900px)");
    const update = () => setIsCompact(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (history.length === 0) return null;

  return (
    <div className="analytics">
      <h3 className="analytics-title">{t("analysisTitle")}</h3>

      <div className="analytics-metrics">
        <div>
          <span>{isTracking ? t("avgAcquisition") : t("average")}</span>
          <strong>{fmtMs(metrics.avg)}</strong>
        </div>
        <div>
          <span>{t("median")}</span>
          <strong>{fmtMs(metrics.median)}</strong>
        </div>
        <div>
          <span>{t("best")}</span>
          <strong>{fmtMs(metrics.best)}</strong>
        </div>
        <div>
          <span>{t("worst")}</span>
          <strong>{fmtMs(metrics.worst)}</strong>
        </div>
        <div>
          <span>{t("consistency")}</span>
          <strong>{fmtMs(metrics.consistency)}</strong>
        </div>
      </div>

      {(() => {
        const reactionChart = reactionSeries.length > 1 && (
          <div className="analytics-chart" key="reaction">
            <p className="analytics-chart-label">{reactionLabel}</p>
            <ResponsiveContainer width="100%" height={110}>
              <LineChart
                data={reactionSeries}
                margin={{ top: 4, right: 10, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.08)"
                />
                <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} unit="ms" />
                <Tooltip
                  contentStyle={{
                    background: "#15171c",
                    border: "1px solid rgba(255,255,255,0.1)",
                    fontSize: 12,
                  }}
                  labelFormatter={(shot) => `${t("shotNumber")} ${shot}`}
                  formatter={(v) => [fmtMs(v), reactionLabel]}
                />
                <ReferenceLine
                  y={metrics.avg}
                  stroke="#5eead4"
                  strokeDasharray="4 4"
                />
                <Line
                  type="monotone"
                  dataKey="reaction"
                  stroke="#ff5a3c"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );

        const accuracyChart = (
          <div className="analytics-chart" key="accuracy">
            <p className="analytics-chart-label">{t("runningAccuracyLabel")}</p>
            <ResponsiveContainer width="100%" height={110}>
              <LineChart
                data={runningAccuracy}
                margin={{ top: 4, right: 10, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.08)"
                />
                <YAxis
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  unit="%"
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    background: "#15171c",
                    border: "1px solid rgba(255,255,255,0.1)",
                    fontSize: 12,
                  }}
                  labelFormatter={(shot) => `${t("shotNumber")} ${shot}`}
                  formatter={(v) => [`${v}%`, t("runningAccuracyLabel")]}
                />
                <ReferenceLine
                  y={100}
                  stroke="rgba(255,255,255,0.15)"
                  strokeDasharray="2 2"
                />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="#5eead4"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );

        const timelineChart = (
          <div className="analytics-chart" key="timeline">
            <p className="analytics-chart-label">
              {isTracking ? t("timelineCaptures") : t("timelineHitsMisses")}
            </p>
            <ResponsiveContainer width="100%" height={70}>
              <BarChart
                data={timeline}
                margin={{ top: 6, right: 10, bottom: 0, left: 10 }}
                barCategoryGap={1}
              >
                <XAxis
                  dataKey="shot"
                  stroke="rgba(255,255,255,0.4)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tick={false}
                />
                <YAxis hide domain={[0, 1]} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.06)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const p = payload[0].payload;
                    return (
                      <div
                        style={{
                          background: "#15171c",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 4,
                          padding: "6px 10px",
                          fontSize: 12,
                          color: "#fff",
                        }}
                      >
                        <div style={{ color: "rgba(255,255,255,0.6)" }}>
                          {p.t}s
                        </div>
                        <div
                          style={{
                            fontWeight: 600,
                            color: p.type === "hit" ? "#5eead4" : "#ff5a3c",
                          }}
                        >
                          {p.type === "hit" ? t("hit") : t("miss")}
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="y" isAnimationActive={false}>
                  {timeline.map((p, i) => (
                    <Cell
                      key={i}
                      fill={p.type === "hit" ? "#5eead4" : "#ff5a3c"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

        const tabs = [
          reactionChart && {
            key: "reaction",
            label: reactionLabel,
            node: reactionChart,
          },
          {
            key: "accuracy",
            label: t("runningAccuracyLabel"),
            node: accuracyChart,
          },
          {
            key: "timeline",
            label: isTracking ? t("timelineCaptures") : t("timelineHitsMisses"),
            node: timelineChart,
          },
        ].filter(Boolean);

        if (!isCompact) {
          return (
            <>
              <div className="analytics-charts-row">
                {reactionChart}
                {accuracyChart}
              </div>
              {timelineChart}
            </>
          );
        }

        const safeActiveTab = Math.min(activeTab, tabs.length - 1);
        return (
          <div className="analytics-compact">
            <div className="analytics-tabs">
              {tabs.map((tab, i) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`analytics-tab${i === safeActiveTab ? " active" : ""}`}
                  onClick={() => setActiveTab(i)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {tabs[safeActiveTab].node}
          </div>
        );
      })()}
    </div>
  );
}
