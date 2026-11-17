/**
 * 효과음·환경음·잔잔한 패드 BGM 을 WebAudio 로 합성한다 (에셋 파일 0개).
 * 브라우저 정책상 사용자 클릭(시작하기) 이후에 init() 해야 소리가 난다.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambienceTimer: number | undefined;
let isNightFn: () => boolean = () => false;

function noiseBuffer(c: AudioContext, seconds: number, brown = false): AudioBuffer {
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

function env(g: GainNode, t: number, peak: number, attack: number, release: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
}

function tone(freq: number, type: OscillatorType, peak: number, attack: number, release: number, at = 0, endFreq?: number) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + attack + release);
  env(g, t, peak, attack, release);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + attack + release + 0.05);
}

function noiseHit(filter: BiquadFilterType, freq: number, peak: number, release: number, q = 1) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, release + 0.1);
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, peak, 0.01, release);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

function startWaves(c: AudioContext, out: AudioNode) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 4, true);
  src.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;
  const g = c.createGain();
  g.gain.value = 0.05;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.12;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.035;
  lfo.connect(lfoGain).connect(g.gain);
  src.connect(lp).connect(g).connect(out);
  src.start();
  lfo.start();
}

const CHORDS = [
  [261.6, 329.6, 392.0, 493.9], // Cmaj7
  [220.0, 261.6, 329.6, 392.0], // Am7
  [174.6, 220.0, 261.6, 329.6], // Fmaj7
  [196.0, 246.9, 293.7, 329.6], // G6
];

function startPad(c: AudioContext, out: AudioNode) {
  const bus = c.createGain();
  bus.gain.value = 0.035;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1100;
  bus.connect(lp).connect(out);
  const bar = 4.8;
  let i = 0;
  const schedule = () => {
    const t = c.currentTime + 0.05;
    for (const f of CHORDS[i % CHORDS.length]!) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f / 2;
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.25, t + 1.6);
      g.gain.linearRampToValueAtTime(0.0001, t + bar + 1);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + bar + 1.1);
    }
    i++;
  };
  schedule();
  window.setInterval(schedule, bar * 1000);
}

function ambienceTick() {
  if (!ctx) return;
  if (isNightFn()) {
    // 귀뚜라미
    for (let k = 0; k < 3; k++) tone(4200 + Math.random() * 300, 'sine', 0.012, 0.005, 0.04, k * 0.09);
  } else {
    // 새소리
    const base = 2200 + Math.random() * 1400;
    tone(base, 'sine', 0.02, 0.01, 0.12, 0, base * 1.4);
    tone(base * 1.2, 'sine', 0.016, 0.01, 0.1, 0.16, base * 0.9);
  }
  ambienceTimer = window.setTimeout(ambienceTick, (isNightFn() ? 1500 : 3500) + Math.random() * 5000);
}

export const audio = {
  init(isNight: () => boolean) {
    isNightFn = isNight;
    if (ctx) return;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    startWaves(ctx, master);
    startPad(ctx, master);
    window.clearTimeout(ambienceTimer);
    ambienceTimer = window.setTimeout(ambienceTick, 2000);
  },
  setMuted(muted: boolean) {
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.1);
  },
  cast: () => noiseHit('highpass', 2500, 0.06, 0.25),
  splash: () => {
    noiseHit('bandpass', 1100, 0.12, 0.35, 0.8);
    tone(500, 'sine', 0.04, 0.005, 0.12, 0, 180);
  },
  bite: () => {
    tone(720, 'sine', 0.1, 0.005, 0.1, 0, 260);
    tone(720, 'sine', 0.08, 0.005, 0.1, 0.13, 260);
  },
  surge: () => noiseHit('bandpass', 700, 0.05, 0.2, 1.5),
  caught: () => [523.3, 659.3, 784.0, 1046.5].forEach((f, i) => tone(f, 'triangle', 0.09, 0.01, 0.35, i * 0.09)),
  rareCaught: () => [523.3, 659.3, 784.0, 987.8, 1174.7, 1568].forEach((f, i) => tone(f, 'triangle', 0.09, 0.01, 0.5, i * 0.08)),
  fail: () => {
    tone(392, 'triangle', 0.06, 0.01, 0.3);
    tone(311.1, 'triangle', 0.06, 0.01, 0.4, 0.18);
  },
  click: () => tone(880, 'sine', 0.04, 0.003, 0.05),
};

/** 낚아올리기·들기·던지기 효과음 */
export const catchAudio = {
  pop: () => tone(520, 'sine', 0.08, 0.005, 0.12, 0, 1100),
  bigSplash: () => {
    noiseHit('lowpass', 900, 0.22, 0.7, 0.7);
    tone(140, 'sine', 0.12, 0.01, 0.35, 0, 60);
  },
  fanfare: () => {
    [392, 523.3, 659.3, 784].forEach((f, i) => tone(f, 'triangle', 0.1, 0.01, 0.3, i * 0.08));
    [523.3, 659.3, 784, 1046.5].forEach((f) => tone(f, 'triangle', 0.06, 0.02, 0.9, 0.36));
  },
  legend: () => {
    [523.3, 659.3, 784, 987.8, 1174.7, 1568].forEach((f, i) => tone(f, 'triangle', 0.09, 0.01, 0.5, i * 0.07));
    for (let i = 0; i < 8; i++) tone(2000 + Math.random() * 1600, 'sine', 0.025, 0.005, 0.25, 0.45 + i * 0.06);
  },
  shimmer: () => {
    for (let i = 0; i < 6; i++) tone(1800 + i * 260, 'sine', 0.03, 0.005, 0.3, i * 0.04);
  },
  stash: () => {
    tone(660, 'triangle', 0.06, 0.005, 0.12);
    tone(880, 'triangle', 0.05, 0.005, 0.15, 0.08);
  },
  flop: () => {
    noiseHit('lowpass', 400, 0.08, 0.12, 1);
    tone(160, 'sine', 0.05, 0.005, 0.08, 0, 90);
  },
  whoosh: () => noiseHit('bandpass', 1800, 0.07, 0.3, 0.6),
};
