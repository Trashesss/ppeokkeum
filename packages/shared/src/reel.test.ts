import { describe, expect, it } from 'vitest';
import { SAFE_MAX, SAFE_MIN, createReel, stepReel, type ReelState } from './reel.ts';
import { createRng } from './rng.ts';

const DT = 1 / 60;

function play(strength: number, policy: (s: ReelState) => boolean, seed = 1, maxS = 40): ReelState {
  const rng = createRng(seed);
  let s = createReel(rng);
  for (let t = 0; t < maxS && s.status === 'active'; t += DT) s = stepReel(s, DT, policy(s), strength, rng);
  return s;
}

describe('끌어올리기', () => {
  const keepInZone = (s: ReelState) => s.tension < (SAFE_MIN + SAFE_MAX) / 2;

  it('안전 구간을 유지하면 가장 힘센 물고기도 잡힌다', () => {
    for (let seed = 1; seed <= 20; seed++) expect(play(0.85, keepInZone, seed).status).toBe('caught');
  });

  it('잡는 데 5~10초 걸린다', () => {
    for (const strength of [0.15, 0.5, 0.85]) {
      const s = play(strength, keepInZone);
      expect(s.elapsed).toBeGreaterThanOrEqual(5);
      expect(s.elapsed).toBeLessThanOrEqual(10);
    }
  });

  it('계속 누르고만 있으면 줄이 끊어진다', () => {
    expect(play(0.3, () => true).status).toBe('snapped');
  });

  it('아무것도 안 하면 물고기가 도망간다', () => {
    expect(play(0.3, () => false).status).toBe('escaped');
  });
});
