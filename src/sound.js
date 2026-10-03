// Lightweight synthesized sound effects using the Web Audio API.
// No external audio assets required.

let ctx = null;
let volume = 0.7; // 0..1, scales every sound effect's gain

export function setVolume(v) {
  volume = Math.min(1, Math.max(0, v));
}

function getCtx() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function beep({ freq, duration, type = "sine", gain = 0.15 }) {
  if (volume <= 0) return;
  const scaledGain = gain * volume;
  try {
    const audioCtx = getCtx();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gainNode.gain.value = scaledGain;
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    gainNode.gain.setValueAtTime(scaledGain, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    osc.stop(now + duration);
  } catch {
    // Audio not available (e.g. before user interaction) — fail silently.
  }
}

export function playHit() {
  beep({ freq: 880, duration: 0.08, type: "triangle", gain: 0.18 });
}

export function playMiss() {
  beep({ freq: 160, duration: 0.12, type: "sawtooth", gain: 0.12 });
}
