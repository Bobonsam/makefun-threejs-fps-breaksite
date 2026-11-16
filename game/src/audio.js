// Procedural sound: no audio files, everything is synthesized from noise and
// oscillators at fire time. Gunshots differ by weapon class — the Longbow booms,
// the Rush-9 chatters — and the bomb's beeping is the round's second clock.
let ctx = null;
let master = null;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(seconds) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function burst({ dur = 0.12, freq = 1800, gain = 0.5, type = 'lowpass', sweepTo = null, delay = 0 }) {
  if (!ensure()) return;
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur + 0.05);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t0);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

function tone({ freq = 440, dur = 0.1, gain = 0.2, type = 'sine', delay = 0, sweepTo = null }) {
  if (!ensure()) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SHOT_SHAPES = {
  p9: { dur: 0.1, freq: 2400, gain: 0.35, sweepTo: 300 },
  rush9: { dur: 0.07, freq: 2600, gain: 0.28, sweepTo: 400 },
  breacher: { dur: 0.28, freq: 900, gain: 0.6, sweepTo: 120 },
  vantage: { dur: 0.13, freq: 2100, gain: 0.42, sweepTo: 240 },
  longbow: { dur: 0.4, freq: 700, gain: 0.7, sweepTo: 60 },
};

export const sfx = {
  unlock() { ensure(); },
  shot(weaponId, distant = false) {
    const shape = SHOT_SHAPES[weaponId] || SHOT_SHAPES.vantage;
    burst({ ...shape, gain: shape.gain * (distant ? 0.3 : 1), freq: shape.freq * (distant ? 0.6 : 1) });
    if (weaponId === 'longbow' || weaponId === 'breacher') tone({ freq: 90, dur: 0.22, gain: 0.3, sweepTo: 40 });
  },
  dryFire() { burst({ dur: 0.03, freq: 3000, gain: 0.12, type: 'highpass' }); },
  reload() {
    burst({ dur: 0.04, freq: 1500, gain: 0.2, type: 'bandpass' });
    burst({ dur: 0.04, freq: 1100, gain: 0.22, type: 'bandpass', delay: 0.28 });
    burst({ dur: 0.05, freq: 1800, gain: 0.2, type: 'bandpass', delay: 0.5 });
  },
  hit(headshot = false) { tone({ freq: headshot ? 1560 : 1180, dur: 0.06, gain: 0.18, type: 'square' }); },
  kill() {
    tone({ freq: 880, dur: 0.08, gain: 0.2, type: 'square' });
    tone({ freq: 1320, dur: 0.12, gain: 0.2, type: 'square', delay: 0.07 });
  },
  hurt() { tone({ freq: 140, dur: 0.15, gain: 0.35, sweepTo: 70 }); burst({ dur: 0.1, freq: 500, gain: 0.2 }); },
  buy() { tone({ freq: 1560, dur: 0.05, gain: 0.15, type: 'square' }); tone({ freq: 2090, dur: 0.08, gain: 0.15, type: 'square', delay: 0.05 }); },
  denied() { tone({ freq: 220, dur: 0.12, gain: 0.2, type: 'square' }); },
  beep(final = false) { tone({ freq: final ? 1560 : 1040, dur: final ? 0.16 : 0.07, gain: 0.22, type: 'square' }); },
  planted() {
    tone({ freq: 1040, dur: 0.08, gain: 0.2, type: 'square' });
    tone({ freq: 1040, dur: 0.08, gain: 0.2, type: 'square', delay: 0.14 });
    tone({ freq: 1560, dur: 0.14, gain: 0.2, type: 'square', delay: 0.28 });
  },
  explode() {
    burst({ dur: 1.4, freq: 3000, gain: 0.9, sweepTo: 40 });
    tone({ freq: 120, dur: 1.2, gain: 0.6, sweepTo: 28 });
  },
  defused() {
    tone({ freq: 780, dur: 0.1, gain: 0.2, type: 'square' });
    tone({ freq: 1040, dur: 0.1, gain: 0.2, type: 'square', delay: 0.1 });
    tone({ freq: 1560, dur: 0.18, gain: 0.2, type: 'square', delay: 0.2 });
  },
  roundWin() {
    tone({ freq: 660, dur: 0.12, gain: 0.18 });
    tone({ freq: 880, dur: 0.12, gain: 0.18, delay: 0.11 });
    tone({ freq: 1100, dur: 0.22, gain: 0.18, delay: 0.22 });
  },
  roundLose() {
    tone({ freq: 440, dur: 0.14, gain: 0.18 });
    tone({ freq: 349, dur: 0.14, gain: 0.18, delay: 0.13 });
    tone({ freq: 262, dur: 0.26, gain: 0.18, delay: 0.26 });
  },
  matchEnd(win) {
    if (win) {
      [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.2, gain: 0.2, delay: i * 0.13 }));
    } else {
      [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.22, gain: 0.2, delay: i * 0.14 }));
    }
  },
};
