import { useCallback, useEffect, useRef, useState } from "react";

// Core game logic hook for the aim trainer. Aiming uses the real OS cursor
// (no Pointer Lock API). Three modes:
// - flicking: hold the cursor at the arena center for `centerDwellTime`,
//   then a target spawns and must be clicked as fast as possible.
// - tracking: a target spawns and moves; hover the cursor over it for
//   `hoverDwellTime` without clicking to capture it, then the next spawns.
// - speed: targets spawn right away (no center gate) and must be clicked
//   as fast as possible, one after another.

const CENTER_RADIUS = 42;
// Grace period (ms) the cursor is allowed to drift outside CENTER_RADIUS
// before the dwell progress resets — absorbs mouse jitter/micro-movements
// so a near-complete ring doesn't get wiped by a single noisy frame.
const CENTER_LEAVE_GRACE = 220;

// Labels/desc are translated at the UI layer via the `modeLabel_<key>` /
// `modeDesc_<key>` i18n keys (see src/i18n.js) so switching language updates
// them live without touching this static config.
export const MODES = {
  flicking: {
    click: true,
    centerGate: true,
    durationType: "hits",
    durations: [15, 30, 60, Infinity],
    minSpawnDistance: 150,
  },
  tracking: {
    click: false,
    moving: true,
    durationType: "time",
    durations: [30, 60, Infinity],
  },
  speed: {
    click: true,
    centerGate: false,
    durationType: "time",
    durations: [15, 30, 60],
  },
};

export const DEFAULT_SETTINGS = {
  targetSize: 34,
  targetSpeed: 2.2,
  centerDwellTime: 1500,
  hoverDwellTime: 3000,
  playArea: "full",
  volume: 0.7,
};

// Formats a millisecond duration for display: values under 1s stay in
// milliseconds ("540ms"), values at/over 1s switch to seconds with two
// decimal places ("1.35s") for readability.
export function fmtMs(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

const PLAY_AREA_RATIOS = { "16:9": 16 / 9, "4:3": 4 / 3 };

// Computes the rectangle (relative to the arena) where targets are allowed
// to spawn, based on the chosen aspect ratio. "full" uses the whole arena.
export function getPlayAreaRect(width, height, playArea) {
  const ratio = PLAY_AREA_RATIOS[playArea];
  if (!ratio) return { x: 0, y: 0, width, height };
  let w = width;
  let h = width / ratio;
  if (h > height) {
    h = height;
    w = height * ratio;
  }
  w *= 0.94;
  h *= 0.94;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

function randomPos(rect, size) {
  const pad = size + 10;
  const w = Math.max(rect.width - pad * 2, 1);
  const h = Math.max(rect.height - pad * 2, 1);
  return {
    x: rect.x + pad + Math.random() * w,
    y: rect.y + pad + Math.random() * h,
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function useAimTrainer({
  duration = 30,
  mode = "flicking",
  areaRef,
  ringRef,
  settings = DEFAULT_SETTINGS,
  onHit,
  onMiss,
}) {
  const [status, setStatus] = useState("idle"); // idle | running | finished
  const [phase, setPhase] = useState("active"); // "centering" | "active"
  const [timeLeft, setTimeLeft] = useState(duration);
  const [targets, setTargets] = useState([]);
  const [crosshair, setCrosshair] = useState({ x: 0, y: 0 });
  const [dwellProgress, setDwellProgress] = useState(0);
  const [playAreaRect, setPlayAreaRect] = useState(null);
  const [stats, setStats] = useState({
    hits: 0,
    misses: 0,
    totalShots: 0,
    bestCombo: 0,
    combo: 0,
    reactionTimes: [],
    history: [],
  });

  const timerRef = useRef(null);
  const matchStartRef = useRef(0);
  const lastSpawnAt = useRef(0);
  const idRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0 });
  const dwellRef = useRef({ id: null, start: 0 });
  const centerDwellRef = useRef(0);
  const centerOutsideSinceRef = useRef(0);
  const statusRef = useRef(status);
  statusRef.current = status;

  const modeConf = MODES[mode] || MODES.flicking;
  const isHitsGoal = modeConf.durationType === "hits";
  const infinite = duration === Infinity;

  const clearTimers = () => clearInterval(timerRef.current);

  const spawnTarget = useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    const { width, height } = area.getBoundingClientRect();
    const rect = getPlayAreaRect(width, height, settings.playArea);
    const size = settings.targetSize;
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    let pos = randomPos(rect, size);

    if (modeConf.minSpawnDistance) {
      let tries = 0;
      while (distance(pos, center) < modeConf.minSpawnDistance && tries < 12) {
        pos = randomPos(rect, size);
        tries++;
      }
    }

    const id = ++idRef.current;
    lastSpawnAt.current = performance.now();
    const angle = Math.random() * Math.PI * 2;
    const vel = modeConf.moving
      ? {
          vx: Math.cos(angle) * settings.targetSpeed,
          vy: Math.sin(angle) * settings.targetSpeed,
        }
      : { vx: 0, vy: 0 };
    const newTarget = {
      id,
      ...pos,
      size,
      spawnedAt: lastSpawnAt.current,
      ...vel,
    };
    setTargets((prev) =>
      modeConf.moving ? [...prev, newTarget] : [newTarget],
    );
    dwellRef.current = { id: null, start: 0 };
    setDwellProgress(0);
  }, [
    areaRef,
    modeConf,
    settings.targetSize,
    settings.targetSpeed,
    settings.playArea,
  ]);

  const start = useCallback(() => {
    setStats({
      hits: 0,
      misses: 0,
      totalShots: 0,
      bestCombo: 0,
      combo: 0,
      reactionTimes: [],
      history: [],
    });
    setTimeLeft(duration);
    setTargets([]);
    setDwellProgress(0);
    idRef.current = 0;
    centerDwellRef.current = 0;
    centerOutsideSinceRef.current = 0;
    matchStartRef.current = performance.now();
    setPhase(modeConf.centerGate ? "centering" : "active");
    setStatus("running");
  }, [duration, modeConf.centerGate]);

  const stop = useCallback(() => {
    clearTimers();
    setStatus("finished");
    setTargets([]);
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setStatus("idle");
    setTargets([]);
    setTimeLeft(duration);
  }, [duration]);

  // countdown + initial spawn (modes without a center gate spawn right away;
  // center-gated modes wait for the centering loop below). Infinite duration
  // and hits-goal modes (flicking counts acertos, not time) skip the
  // countdown entirely.
  useEffect(() => {
    if (status !== "running") return;
    if (!infinite && !isHitsGoal) {
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            stop();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    if (!modeConf.centerGate) spawnTarget();
    return () => clearTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // track the real cursor position relative to the arena — no pointer lock,
  // no raw movement deltas, just the actual mouse, so there's nothing to
  // get stuck or desync (the old bug requiring ESC to recover the cursor).
  useEffect(() => {
    if (status !== "running") return;
    const area = areaRef.current;
    if (!area) return;
    const onMove = (e) => {
      const rect = area.getBoundingClientRect();
      const next = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      mouseRef.current = next;
      setCrosshair(next);
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [status, areaRef]);

  // recompute the visible play-area rectangle whenever the trainer is
  // running or the arena is resized, so the dashed boundary stays accurate.
  useEffect(() => {
    if (status !== "running") {
      setPlayAreaRect(null);
      return;
    }
    const area = areaRef.current;
    if (!area) return;
    const update = () => {
      const { width, height } = area.getBoundingClientRect();
      setPlayAreaRect(getPlayAreaRect(width, height, settings.playArea));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [status, areaRef, settings.playArea]);

  // center gate loop: player must hold the cursor near the arena center for
  // settings.centerDwellTime before a target is allowed to spawn.
  useEffect(() => {
    if (status !== "running" || !modeConf.centerGate || phase !== "centering")
      return;
    // paint the ring directly via the DOM each frame instead of relying only
    // on the React re-render from setDwellProgress — guarantees the fill
    // animation is always visible even if a render gets batched/skipped.
    const paintRing = (progress) => {
      if (!ringRef?.current) return;
      ringRef.current.style.strokeDashoffset = `${
        2 * Math.PI * 28 * (1 - progress)
      }`;
    };
    paintRing(0);
    let raf;
    const tick = () => {
      const area = areaRef.current;
      if (!area) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const { width, height } = area.getBoundingClientRect();
      const rect = getPlayAreaRect(width, height, settings.playArea);
      const center = {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      };
      const within = distance(mouseRef.current, center) <= CENTER_RADIUS;
      const now = performance.now();
      if (within) {
        centerOutsideSinceRef.current = 0;
        if (centerDwellRef.current === 0) centerDwellRef.current = now;
        const elapsed = now - centerDwellRef.current;
        const progress = Math.min(elapsed / settings.centerDwellTime, 1);
        setDwellProgress(progress);
        paintRing(progress);
        if (progress >= 1) {
          centerDwellRef.current = 0;
          centerOutsideSinceRef.current = 0;
          setDwellProgress(0);
          setPhase("active");
          spawnTarget();
          return;
        }
      } else if (centerDwellRef.current !== 0) {
        // don't wipe progress on a single noisy frame — only reset once the
        // cursor has stayed outside the radius for CENTER_LEAVE_GRACE.
        if (centerOutsideSinceRef.current === 0) {
          centerOutsideSinceRef.current = now;
        } else if (now - centerOutsideSinceRef.current >= CENTER_LEAVE_GRACE) {
          centerDwellRef.current = 0;
          centerOutsideSinceRef.current = 0;
          setDwellProgress(0);
          paintRing(0);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    status,
    modeConf.centerGate,
    phase,
    areaRef,
    ringRef,
    spawnTarget,
    settings.centerDwellTime,
    settings.playArea,
  ]);

  // movement loop for moving targets (tracking mode)
  useEffect(() => {
    if (status !== "running" || !modeConf.moving) return;
    let raf;
    const area = areaRef.current;
    const tick = () => {
      if (!area) return;
      const { width, height } = area.getBoundingClientRect();
      const rect = getPlayAreaRect(width, height, settings.playArea);
      const minX = rect.x;
      const maxX = rect.x + rect.width;
      const minY = rect.y;
      const maxY = rect.y + rect.height;
      setTargets((prev) =>
        prev.map((t) => {
          let { x, y, vx, vy, size } = t;
          x += vx;
          y += vy;
          if (x < minX + size || x > maxX - size) vx *= -1;
          if (y < minY + size || y > maxY - size) vy *= -1;
          return { ...t, x, y, vx, vy };
        }),
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, modeConf.moving, areaRef, settings.playArea]);

  const registerHit = useCallback(
    (targetId) => {
      // Snapshot spawn time and compute reaction *before* spawnTarget() runs
      // below — for click-based modes without a center gate (speed), the
      // next target spawns synchronously inside this same function call,
      // which overwrites lastSpawnAt.current. Reading it later, inside the
      // setStats updater, would then measure time against the *new* target
      // instead of the one just hit, making reaction collapse to ~0ms.
      const now = performance.now();
      const elapsed = now - lastSpawnAt.current;
      // Tracking captures only after a continuous hover of
      // `hoverDwellTime`, so raw spawn-to-capture time is always inflated
      // by that fixed floor and says little about actual aim skill.
      // Subtract it so "reaction" reflects acquisition time instead.
      const reaction = modeConf.moving
        ? Math.max(0, elapsed - settings.hoverDwellTime)
        : elapsed;
      setStats((s) => {
        const combo = s.combo + 1;
        return {
          hits: s.hits + 1,
          misses: s.misses,
          totalShots: s.totalShots + 1,
          combo,
          bestCombo: Math.max(s.bestCombo, combo),
          reactionTimes: [...s.reactionTimes, reaction],
          history: [
            ...s.history,
            {
              type: "hit",
              t: now - matchStartRef.current,
              reaction,
              shot: s.totalShots + 1,
            },
          ],
        };
      });
      setTargets((prev) => prev.filter((t) => t.id !== targetId));
      onHit?.();
      if (statusRef.current !== "running") return;
      // hits-goal completion is handled in the effect below, which reacts to
      // the committed `stats.hits` value instead of a stale local variable.
      if (isHitsGoal && !infinite) return;
      if (modeConf.centerGate) {
        centerDwellRef.current = 0;
        centerOutsideSinceRef.current = 0;
        setDwellProgress(0);
        setPhase("centering");
      } else {
        spawnTarget();
      }
    },
    [
      modeConf.centerGate,
      modeConf.moving,
      settings.hoverDwellTime,
      spawnTarget,
      onHit,
      isHitsGoal,
      infinite,
    ],
  );

  // for hits-goal modes (flicking), advance to the next target or stop the
  // match once stats.hits has actually committed — reading a locally-closed
  // "newHits" variable synchronously inside registerHit was always stale
  // because the setStats updater hasn't run yet at that point.
  useEffect(() => {
    if (status !== "running" || !isHitsGoal || infinite) return;
    if (stats.hits === 0) return;
    if (stats.hits >= duration) {
      stop();
      return;
    }
    if (modeConf.centerGate) {
      centerDwellRef.current = 0;
      centerOutsideSinceRef.current = 0;
      setDwellProgress(0);
      setPhase("centering");
    } else {
      spawnTarget();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.hits]);

  const registerMiss = useCallback(() => {
    setStats((s) => ({
      ...s,
      misses: s.misses + 1,
      totalShots: s.totalShots + 1,
      combo: 0,
      history: [
        ...s.history,
        {
          type: "miss",
          t: performance.now() - matchStartRef.current,
          shot: s.totalShots + 1,
        },
      ],
    }));
    onMiss?.();
  }, [onMiss]);

  // click-to-shoot hit testing (flicking / speed) — only while a target is
  // actually on screen (phase "active"), so clicks during the center gate
  // don't register as misses.
  useEffect(() => {
    if (!modeConf.click || status !== "running" || phase !== "active") return;
    const onMouseDown = () => {
      const hitTarget = targets.find(
        (t) => distance(mouseRef.current, t) <= t.size,
      );
      if (hitTarget) registerHit(hitTarget.id);
      else registerMiss();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [modeConf.click, status, phase, targets, registerHit, registerMiss]);

  // dwell-to-capture loop (tracking mode)
  useEffect(() => {
    if (modeConf.click || status !== "running") return;
    let raf;
    const tick = () => {
      const target = targets[0];
      if (target) {
        const within = distance(mouseRef.current, target) <= target.size;
        if (within) {
          if (dwellRef.current.id !== target.id) {
            dwellRef.current = { id: target.id, start: performance.now() };
          }
          const elapsed = performance.now() - dwellRef.current.start;
          const progress = Math.min(elapsed / settings.hoverDwellTime, 1);
          setDwellProgress(progress);
          if (progress >= 1) {
            // Reset dwell state and stop self-chaining this rAF loop instead
            // of scheduling another frame below: `targets` (a dep of this
            // effect) changes almost every frame in tracking mode due to the
            // movement loop, so this effect is torn down and recreated very
            // frequently. Without this early return, a stale closure could
            // still see the just-captured target in `targets` on the next
            // frame (state updates land asynchronously) and call
            // `registerHit` on it a second time before the effect restarts.
            dwellRef.current = { id: null, start: 0 };
            setDwellProgress(0);
            registerHit(target.id);
            return;
          }
        } else if (dwellRef.current.id !== null) {
          dwellRef.current = { id: null, start: 0 };
          setDwellProgress(0);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [modeConf.click, settings.hoverDwellTime, status, targets, registerHit]);

  return {
    status,
    phase,
    timeLeft: infinite ? Infinity : timeLeft,
    targets,
    stats,
    crosshair,
    dwellProgress,
    playAreaRect,
    start,
    stop,
    reset,
    needsClick: modeConf.click,
    centerGate: modeConf.centerGate,
    isHitsGoal,
    hitsGoal: isHitsGoal && !infinite ? duration : null,
    history: stats.history,
  };
}
