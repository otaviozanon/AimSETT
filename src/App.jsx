import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAimTrainer,
  MODES,
  DEFAULT_SETTINGS,
  getPlayAreaRect,
  fmtMs,
} from "./useAimTrainer";
import { playHit, playMiss, setVolume } from "./sound";
import Target from "./Target";
import "./App.css";

// MatchAnalytics pulls in recharts (~400kB), only needed after a match
// finishes - loading it lazily keeps that weight out of the initial bundle.
const MatchAnalytics = lazy(() => import("./MatchAnalytics"));

const LANGUAGES = [
  { code: "pt", label: "PT" },
  { code: "en", label: "EN" },
];

export default function App() {
  const { t, i18n } = useTranslation();

  function fmtDuration(d, durationType) {
    if (d === Infinity) return "∞";
    return durationType === "hits" ? `${d} ${t("hitsUnit")}` : `${d}s`;
  }

  const [mode, setMode] = useState("flicking");
  const [duration, setDuration] = useState(30);
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("aimsett-settings");
      return saved
        ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
        : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [infoMode, setInfoMode] = useState(null);
  const areaRef = useRef(null);
  const ringRef = useRef(null);
  const stageRef = useRef(null);
  const [previewRect, setPreviewRect] = useState(null);

  const modeConf = MODES[mode];

  // keep the Web Audio gain in sync with the settings slider, including on
  // first mount (so the stored/default volume actually applies).
  useEffect(() => {
    setVolume(settings.volume);
  }, [settings.volume]);

  // persist settings across sessions (target size, dwell times, volume,
  // play area) so they survive a page reload, same as the language choice.
  useEffect(() => {
    localStorage.setItem("aimsett-settings", JSON.stringify(settings));
  }, [settings]);

  // keep duration valid whenever the mode changes (each mode exposes its own
  // list of durations). Only `mode` must trigger this - `duration` and
  // `modeConf` are intentionally excluded from deps: including them would
  // re-run the effect right after this same effect corrects `duration`,
  // and again whenever `modeConf` is recomputed, with no further effect.
  useEffect(() => {
    if (!modeConf.durations.includes(duration)) {
      setDuration(modeConf.durations[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const {
    status,
    phase,
    timeLeft,
    targets,
    stats,
    crosshair,
    dwellProgress,
    start,
    stop,
    reset,
    needsClick,
    centerGate,
    isHitsGoal,
    hitsGoal,
    history,
  } = useAimTrainer({
    duration,
    mode,
    areaRef,
    ringRef,
    settings,
    onHit: () => playHit(),
    onMiss: () => playMiss(),
  });

  // keep a live preview of the play-area boundary synced to the stage size,
  // so switching "full / 16:9 / 4:3" in settings shows the crop instantly —
  // even before starting a run.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      setPreviewRect(getPlayAreaRect(width, height, settings.playArea));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [settings.playArea]);

  const accuracy = useMemo(() => {
    if (stats.totalShots === 0) return 0;
    return Math.round((stats.hits / stats.totalShots) * 100);
  }, [stats]);

  const avgReaction = useMemo(() => {
    if (stats.reactionTimes.length === 0) return 0;
    const avg =
      stats.reactionTimes.reduce((a, b) => a + b, 0) /
      stats.reactionTimes.length;
    return Math.round(avg);
  }, [stats.reactionTimes]);

  const bestReaction = useMemo(
    () =>
      stats.reactionTimes.length
        ? Math.round(Math.min(...stats.reactionTimes))
        : 0,
    [stats.reactionTimes],
  );

  const worstReaction = useMemo(
    () =>
      stats.reactionTimes.length
        ? Math.round(Math.max(...stats.reactionTimes))
        : 0,
    [stats.reactionTimes],
  );

  // "Tracking" never misses (there's no click to whiff) and its combo is
  // always equal to the hit count, so accuracy/erros/combo are meaningless
  // there — show capture-time stats instead. Flicking/Speed are click-based,
  // so accuracy and combo are the meaningful signals.
  const isTrackingMode = mode === "tracking";
  const modeLabel = t(`modeLabel_${mode}`);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Aim<span className="title-accent">SETT</span>
        </div>
        {status === "running" && (
          <div className="hud">
            <div className="hud-item time">
              {isHitsGoal
                ? hitsGoal
                  ? `${stats.hits}/${hitsGoal}`
                  : "∞"
                : timeLeft === Infinity
                  ? "∞"
                  : `${timeLeft}s`}
            </div>
            {!isHitsGoal && (
              <div className="hud-item">
                {isTrackingMode ? t("captured") : t("score")}{" "}
                <strong>{stats.hits}</strong>
              </div>
            )}
            {!isTrackingMode && (
              <>
                <div className="hud-item">
                  {t("acc")} <strong>{accuracy}%</strong>
                </div>
                <div className="hud-item combo">
                  {t("combo")} <strong>{stats.combo}</strong>
                </div>
              </>
            )}
          </div>
        )}
        {status !== "running" && (
          <div className="topbar-actions">
            <div className="lang-switch">
              {LANGUAGES.map((lng) => (
                <button
                  key={lng.code}
                  className={`lang-btn ${i18n.language === lng.code ? "active" : ""}`}
                  onClick={() => i18n.changeLanguage(lng.code)}
                  aria-label={lng.label}
                >
                  {lng.label}
                </button>
              ))}
            </div>
            <button
              className="settings-toggle"
              onClick={() => setShowSettings((v) => !v)}
              aria-label={t("settings")}
            >
              ⚙
            </button>
          </div>
        )}
      </header>

      {status !== "running" && showSettings && (
        <div className="settings-panel">
          <h3>{t("settings")}</h3>
          <label>
            {t("targetSize")}
            <input
              type="range"
              min="18"
              max="60"
              value={settings.targetSize}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  targetSize: Number(e.target.value),
                }))
              }
            />
            <span>{settings.targetSize}px</span>
          </label>
          <label>
            {t("targetSpeedTracking")}
            <input
              type="range"
              min="0.5"
              max="6"
              step="0.1"
              value={settings.targetSpeed}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  targetSpeed: Number(e.target.value),
                }))
              }
            />
            <span>{settings.targetSpeed.toFixed(1)}</span>
          </label>
          <label>
            {t("centerDwellFlicking")}
            <input
              type="range"
              min="500"
              max="3000"
              step="100"
              value={settings.centerDwellTime}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  centerDwellTime: Number(e.target.value),
                }))
              }
            />
            <span>{(settings.centerDwellTime / 1000).toFixed(1)}s</span>
          </label>
          <label>
            {t("hoverDwellTracking")}
            <input
              type="range"
              min="500"
              max="5000"
              step="100"
              value={settings.hoverDwellTime}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  hoverDwellTime: Number(e.target.value),
                }))
              }
            />
            <span>{(settings.hoverDwellTime / 1000).toFixed(1)}s</span>
          </label>
          <label>
            {t("volume")}
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round(settings.volume * 100)}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  volume: Number(e.target.value) / 100,
                }))
              }
            />
            <span>{Math.round(settings.volume * 100)}%</span>
          </label>
          <label>
            {t("playArea")}
            <div className="pill-row">
              {["full", "16:9", "4:3"].map((pa) => (
                <button
                  key={pa}
                  className={`pill ${settings.playArea === pa ? "active" : ""}`}
                  onClick={() => setSettings((s) => ({ ...s, playArea: pa }))}
                >
                  {pa === "full" ? t("fullscreen") : pa}
                </button>
              ))}
            </div>
          </label>
          <button
            className="link-btn"
            onClick={() => setSettings(DEFAULT_SETTINGS)}
          >
            {t("restoreDefaults")}
          </button>
        </div>
      )}

      <div className="stage" ref={stageRef}>
        {previewRect && settings.playArea !== "full" && (
          <div
            className="play-area-bounds"
            style={{
              left: previewRect.x,
              top: previewRect.y,
              width: previewRect.width,
              height: previewRect.height,
            }}
          />
        )}
        {status !== "running" && (
          <div className="panel">
            {status === "finished" && (
              <div className="results">
                <h2>{t("trainingFinished")}</h2>
                <p className="results-meta">
                  {modeLabel} · {fmtDuration(duration, modeConf.durationType)}
                </p>
                <div className="results-grid">
                  {isTrackingMode ? (
                    <>
                      <div>
                        <span>{t("targetsCapured")}</span>
                        <strong>{stats.hits}</strong>
                      </div>
                      <div>
                        <span>{t("avgAcquisition")}</span>
                        <strong>{fmtMs(avgReaction)}</strong>
                      </div>
                      <div>
                        <span>{t("bestAcquisition")}</span>
                        <strong>{fmtMs(bestReaction)}</strong>
                      </div>
                      <div>
                        <span>{t("worstAcquisition")}</span>
                        <strong>{fmtMs(worstReaction)}</strong>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span>{t("hits")}</span>
                        <strong>{stats.hits}</strong>
                      </div>
                      <div>
                        <span>{t("misses")}</span>
                        <strong>{stats.misses}</strong>
                      </div>
                      <div>
                        <span>{t("accuracy")}</span>
                        <strong>{accuracy}%</strong>
                      </div>
                      <div>
                        <span>{t("bestCombo")}</span>
                        <strong>{stats.bestCombo}</strong>
                      </div>
                      <div>
                        <span>{t("avgReaction")}</span>
                        <strong>{fmtMs(avgReaction)}</strong>
                      </div>
                    </>
                  )}
                </div>

                <Suspense fallback={null}>
                  <MatchAnalytics history={history} mode={mode} />
                </Suspense>

                <button className="link-btn back-btn" onClick={reset}>
                  {t("backToMenu")}
                </button>

                <h1 className="title results-logo">
                  Aim<span className="title-accent">SETT</span>
                </h1>
              </div>
            )}

            {status !== "finished" && (
              <>
                <h1 className="title">
                  Aim<span className="title-accent">SETT</span>
                </h1>

                <div className="options">
                  <div className="option-group">
                    <div className="option-label-row">
                      <span className="option-label">{t("mode")}</span>
                      <button
                        className="info-btn"
                        onClick={() => setInfoMode((v) => !v)}
                        aria-label={modeLabel}
                      >
                        i
                      </button>
                    </div>
                    <div className="pill-row">
                      {Object.keys(MODES).map((key) => (
                        <button
                          key={key}
                          className={`pill ${mode === key ? "active" : ""}`}
                          onClick={() => setMode(key)}
                        >
                          {t(`modeLabel_${key}`)}
                        </button>
                      ))}
                    </div>
                    {infoMode && (
                      <p className="mode-info-text">{t(`modeDesc_${mode}`)}</p>
                    )}
                  </div>
                  <div className="option-group">
                    <span className="option-label">
                      {modeConf.durationType === "hits"
                        ? t("hits")
                        : t("duration")}
                    </span>
                    <div className="pill-row">
                      {modeConf.durations.map((d) => (
                        <button
                          key={d}
                          className={`pill ${duration === d ? "active" : ""}`}
                          onClick={() => setDuration(d)}
                        >
                          {fmtDuration(d, modeConf.durationType)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button className="start-btn" onClick={start}>
                  {t("start")}
                </button>
              </>
            )}
          </div>
        )}

        {status === "running" && (
          <div className="arena" ref={areaRef}>
            {centerGate && phase === "centering" && (
              <div
                className="center-gate"
                style={{
                  "--dwell-progress": dwellProgress,
                }}
              >
                <svg viewBox="0 0 64 64" className="center-gate-ring">
                  <circle className="track" cx="32" cy="32" r="28" />
                  <circle
                    ref={ringRef}
                    className="progress"
                    cx="32"
                    cy="32"
                    r="28"
                    style={{
                      strokeDashoffset: `${2 * Math.PI * 28 * (1 - dwellProgress)}`,
                    }}
                  />
                </svg>
                <span className="center-gate-hint">{t("centerGateHint")}</span>
              </div>
            )}
            <div
              className="crosshair"
              style={{ left: crosshair.x, top: crosshair.y }}
            />
            {targets.map((t) => (
              <Target
                key={t.id}
                target={t}
                dwellProgress={!needsClick ? dwellProgress : 0}
              />
            ))}
            <span className="mode-tag">{modeLabel}</span>
            <button className="exit-btn" onClick={stop}>
              {t("end")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
