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
      if (!saved) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(saved);
      // Deep-merge `crosshair` specifically: a plain spread would drop any
      // new crosshair field added after a user's settings were already
      // persisted (the saved blob only has the older fields).
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        crosshair: { ...DEFAULT_SETTINGS.crosshair, ...parsed.crosshair },
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showCrosshair, setShowCrosshair] = useState(false);
  // Mode description is shown by default (simplified, always-on help text);
  // clicking the "i" button hides it for users who already know the mode.
  const [infoMode, setInfoMode] = useState(true);
  const areaRef = useRef(null);
  const ringRef = useRef(null);
  const stageRef = useRef(null);
  const [previewRect, setPreviewRect] = useState(null);
  const [menuCursor, setMenuCursor] = useState({ x: 0, y: 0 });

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

  // let the user preview their crosshair settings on the menu screen too
  // (before clicking Start) — same OS-cursor tracking approach used during
  // gameplay, just scoped to the menu instead of the arena.
  useEffect(() => {
    if (status === "running") return;
    const el = stageRef.current;
    if (!el) return;
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      setMenuCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    el.addEventListener("mousemove", onMove);
    return () => el.removeEventListener("mousemove", onMove);
  }, [status]);

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

  // Renders the custom crosshair markup at a given {x, y} — shared by the
  // menu preview and the in-game arena so both stay pixel-identical.
  function renderCrosshair(pos) {
    const { color, size, thickness, gap, dot, dotSize } = settings.crosshair;
    const arm = Math.max((size - gap) / 2, 0);
    const half = gap / 2;
    return (
      <div className="crosshair" style={{ left: pos.x, top: pos.y }}>
        <span
          className="ch-line ch-top"
          style={{
            width: thickness,
            height: arm,
            bottom: half,
            background: color,
          }}
        />
        <span
          className="ch-line ch-bottom"
          style={{
            width: thickness,
            height: arm,
            top: half,
            background: color,
          }}
        />
        <span
          className="ch-line ch-left"
          style={{
            height: thickness,
            width: arm,
            right: half,
            background: color,
          }}
        />
        <span
          className="ch-line ch-right"
          style={{
            height: thickness,
            width: arm,
            left: half,
            background: color,
          }}
        />
        {dot && (
          <span
            className="ch-dot"
            style={{ width: dotSize, height: dotSize, background: color }}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`app ${!settings.crosshair.enabled ? "cursor-only" : ""}`}>
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
          </div>
        )}
      </header>

      {status !== "running" && showSettings && (
        <div
          className="crosshair-modal-backdrop"
          onClick={() => setShowSettings(false)}
        >
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
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
        </div>
      )}

      {status !== "running" && showCrosshair && (
        <div
          className="crosshair-modal-backdrop"
          onClick={() => setShowCrosshair(false)}
        >
          <div
            className="settings-panel crosshair-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t("crosshairSettings")}</h3>
            <div className="crosshair-preview-box">
              {settings.crosshair.enabled ? (
                renderCrosshair({ x: "50%", y: "50%" })
              ) : (
                <span className="crosshair-preview-cursor-hint">
                  {t("cursorOnly")}
                </span>
              )}
            </div>
            <label>
              {t("crosshairMode")}
              <div className="pill-row">
                <button
                  className={`pill ${settings.crosshair.enabled ? "active" : ""}`}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      crosshair: { ...s.crosshair, enabled: true },
                    }))
                  }
                >
                  {t("crosshairOn")}
                </button>
                <button
                  className={`pill ${!settings.crosshair.enabled ? "active" : ""}`}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      crosshair: { ...s.crosshair, enabled: false },
                    }))
                  }
                >
                  {t("cursorOnly")}
                </button>
              </div>
            </label>
            {settings.crosshair.enabled && (
              <>
                <label>
                  {t("crosshairColor")}
                  <input
                    type="color"
                    value={settings.crosshair.color}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        crosshair: { ...s.crosshair, color: e.target.value },
                      }))
                    }
                  />
                </label>
                <label>
                  {t("crosshairSize")}
                  <input
                    type="range"
                    min="8"
                    max="60"
                    value={settings.crosshair.size}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        crosshair: {
                          ...s.crosshair,
                          size: Number(e.target.value),
                        },
                      }))
                    }
                  />
                  <span>{settings.crosshair.size}px</span>
                </label>
                <label>
                  {t("crosshairThickness")}
                  <input
                    type="range"
                    min="1"
                    max="8"
                    value={settings.crosshair.thickness}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        crosshair: {
                          ...s.crosshair,
                          thickness: Number(e.target.value),
                        },
                      }))
                    }
                  />
                  <span>{settings.crosshair.thickness}px</span>
                </label>
                <label>
                  {t("crosshairGap")}
                  <input
                    type="range"
                    min="0"
                    max="24"
                    value={settings.crosshair.gap}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        crosshair: {
                          ...s.crosshair,
                          gap: Number(e.target.value),
                        },
                      }))
                    }
                  />
                  <span>{settings.crosshair.gap}px</span>
                </label>
                <label>
                  {t("crosshairDot")}
                  <div className="pill-row">
                    <button
                      className={`pill ${settings.crosshair.dot ? "active" : ""}`}
                      onClick={() =>
                        setSettings((s) => ({
                          ...s,
                          crosshair: { ...s.crosshair, dot: true },
                        }))
                      }
                    >
                      {t("on")}
                    </button>
                    <button
                      className={`pill ${!settings.crosshair.dot ? "active" : ""}`}
                      onClick={() =>
                        setSettings((s) => ({
                          ...s,
                          crosshair: { ...s.crosshair, dot: false },
                        }))
                      }
                    >
                      {t("off")}
                    </button>
                  </div>
                </label>
                {settings.crosshair.dot && (
                  <label>
                    {t("crosshairDotSize")}
                    <input
                      type="range"
                      min="2"
                      max="10"
                      value={settings.crosshair.dotSize}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          crosshair: {
                            ...s.crosshair,
                            dotSize: Number(e.target.value),
                          },
                        }))
                      }
                    />
                    <span>{settings.crosshair.dotSize}px</span>
                  </label>
                )}
              </>
            )}
            <button
              className="link-btn"
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  crosshair: DEFAULT_SETTINGS.crosshair,
                }))
              }
            >
              {t("restoreDefaults")}
            </button>
          </div>
        </div>
      )}

      <div
        className={`stage ${status !== "running" && !settings.crosshair.enabled ? "no-crosshair" : ""}`}
        ref={stageRef}
      >
        {status !== "running" &&
          settings.crosshair.enabled &&
          renderCrosshair(menuCursor)}
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

                <div className="start-row">
                  <div className="icon-toggle-row">
                    <button
                      className="crosshair-icon-btn"
                      onClick={() => {
                        setShowCrosshair((v) => !v);
                        setShowSettings(false);
                      }}
                      aria-label={t("crosshairSettings")}
                    >
                      <span className="crosshair-icon-glyph">⊕</span>
                      <span className="crosshair-icon-label">
                        {t("crosshairSettings")}
                      </span>
                    </button>
                    <button
                      className="crosshair-icon-btn"
                      onClick={() => {
                        setShowSettings((v) => !v);
                        setShowCrosshair(false);
                      }}
                      aria-label={t("settings")}
                    >
                      <span className="crosshair-icon-glyph">⚙</span>
                      <span className="crosshair-icon-label">
                        {t("settings")}
                      </span>
                    </button>
                  </div>
                  <button className="start-btn" onClick={start}>
                    {t("start")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {status === "running" && (
          <div
            className={`arena ${!settings.crosshair.enabled ? "no-crosshair" : ""}`}
            ref={areaRef}
          >
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
            {settings.crosshair.enabled && renderCrosshair(crosshair)}
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
