import { Color } from 'three';

interface Key {
  t: number;
  sky: string;
  hemiSky: string;
  hemiGround: string;
  sun: string;
  sunI: number;
  hemiI: number;
  night: number;
}

/** 시각(0~1)별 하늘 팔레트. 저폴리 톤에 맞춰 채도를 낮춘 파스텔. */
const KEYS: Key[] = [
  { t: 0.0, sky: '#18203d', hemiSky: '#5568a0', hemiGround: '#252a3c', sun: '#a9bcff', sunI: 0.55, hemiI: 0.85, night: 1 },
  { t: 0.2, sky: '#1d2747', hemiSky: '#5568a0', hemiGround: '#252a3c', sun: '#a9bcff', sunI: 0.55, hemiI: 0.85, night: 1 },
  { t: 0.27, sky: '#f2b48a', hemiSky: '#ffd2b0', hemiGround: '#5a4a52', sun: '#ffb27a', sunI: 1.2, hemiI: 0.8, night: 0.2 },
  { t: 0.34, sky: '#a8d8ef', hemiSky: '#cfeaff', hemiGround: '#7a8a5a', sun: '#fff1d8', sunI: 2.2, hemiI: 1.1, night: 0 },
  { t: 0.66, sky: '#a8d8ef', hemiSky: '#cfeaff', hemiGround: '#7a8a5a', sun: '#fff1d8', sunI: 2.2, hemiI: 1.1, night: 0 },
  { t: 0.73, sky: '#f0957a', hemiSky: '#ffc0a0', hemiGround: '#5a4050', sun: '#ff9a6a', sunI: 1.2, hemiI: 0.8, night: 0.25 },
  { t: 0.8, sky: '#1d2747', hemiSky: '#5568a0', hemiGround: '#252a3c', sun: '#a9bcff', sunI: 0.55, hemiI: 0.85, night: 1 },
  { t: 1.0, sky: '#18203d', hemiSky: '#5568a0', hemiGround: '#252a3c', sun: '#a9bcff', sunI: 0.55, hemiI: 0.85, night: 1 },
];

const ca = new Color();
const cb = new Color();

export interface SkyState {
  sky: Color;
  hemiSky: Color;
  hemiGround: Color;
  sun: Color;
  sunI: number;
  hemiI: number;
  night: number;
}

export function createSkyState(): SkyState {
  return { sky: new Color(), hemiSky: new Color(), hemiGround: new Color(), sun: new Color(), sunI: 1, hemiI: 1, night: 0 };
}

export function sampleSky(t: number, out: SkyState): SkyState {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]!.t < t) i++;
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  const k = (t - a.t) / (b.t - a.t);
  const mix = (target: Color, x: string, y: string) => target.copy(ca.set(x)).lerp(cb.set(y), k);
  mix(out.sky, a.sky, b.sky);
  mix(out.hemiSky, a.hemiSky, b.hemiSky);
  mix(out.hemiGround, a.hemiGround, b.hemiGround);
  mix(out.sun, a.sun, b.sun);
  out.sunI = a.sunI + (b.sunI - a.sunI) * k;
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * k;
  out.night = a.night + (b.night - a.night) * k;
  return out;
}
