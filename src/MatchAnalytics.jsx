import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { fmtMs } from "./useAimTrainer";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ScatterChart,
  Scatter,
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

  const timeline = useMemo(
    () =>
      history.map((h) => ({
        t: Math.round(h.t / 100) / 10,
        y: h.type === "hit" ? 1 : 0,
        type: h.type,
      })),
    [history],
  );

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

      {reactionSeries.length > 1 && (
        <div className="analytics-chart">
          <p className="analytics-chart-label">{reactionLabel}</p>
          <ResponsiveContainer width="100%" height={110}>
            <LineChart data={reactionSeries}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.08)"
              />
              <XAxis
                dataKey="shot"
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
              />
              <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} unit="ms" />
              <Tooltip
                contentStyle={{
                  background: "#15171c",
                  border: "1px solid rgba(255,255,255,0.1)",
                  fontSize: 12,
                }}
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
      )}

      <div className="analytics-chart">
        <p className="analytics-chart-label">
          {isTracking ? t("timelineCaptures") : t("timelineHitsMisses")}
        </p>
        <ResponsiveContainer width="100%" height={70}>
          <ScatterChart margin={{ top: 6, right: 10, bottom: 0, left: 10 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.08)"
            />
            <XAxis
              type="number"
              dataKey="t"
              unit="s"
              stroke="rgba(255,255,255,0.4)"
              fontSize={11}
            />
            <YAxis type="number" dataKey="y" hide domain={[-0.5, 1.5]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{
                background: "#15171c",
                border: "1px solid rgba(255,255,255,0.1)",
                fontSize: 12,
              }}
              formatter={(_, __, p) => [
                p.payload.type === "hit" ? t("hit") : t("miss"),
                "",
              ]}
            />
            <Scatter data={timeline}>
              {timeline.map((p, i) => (
                <Cell key={i} fill={p.type === "hit" ? "#5eead4" : "#ff5a3c"} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
