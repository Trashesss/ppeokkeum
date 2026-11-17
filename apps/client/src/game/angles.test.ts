import { describe, expect, it } from 'vitest';
import { angleDamp } from './angles';

function path(from: number, to: number): number[] {
  const out: number[] = [];
  let a = from;
  for (let i = 0; i < 120; i++) out.push((a = angleDamp(a, to, 14, 1 / 60)));
  return out;
}

describe('angleDamp', () => {
  it('뒤로 젖힌 팔(2.6)에서 앞(-1.2)으로 갈 때 팔이 아래(0)를 지나지 않고 머리 위(±π)를 지난다', () => {
    const p = path(2.6, -1.2);
    expect(p.some((a) => Math.abs(a) < 1)).toBe(false);
    expect(p.at(-1)!).toBeCloseTo(-1.2, 2);
  });

  it('가까운 각도는 그대로 따라간다', () => {
    const p = path(-0.9, -0.5);
    for (const a of p) expect(a).toBeGreaterThanOrEqual(-0.9 - 1e-9);
    expect(p.at(-1)!).toBeCloseTo(-0.5, 2);
  });

  it('결과는 항상 -π~π 범위', () => {
    for (const a of path(3, -3)) expect(Math.abs(a)).toBeLessThanOrEqual(Math.PI);
  });
});
