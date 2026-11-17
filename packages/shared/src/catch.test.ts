import { describe, expect, it } from 'vitest';
import { RARITY_WEIGHT, catchTier, isValidReaction, rollBiteDelay, rollCatch } from './catch.ts';
import { FISH_SPECIES, getSpecies, speciesAvailable, type WaterType } from './fish.ts';
import { createRng } from './rng.ts';
import type { DayPhase } from './time.ts';

const waters: WaterType[] = ['lake', 'river', 'sea'];
const phases: DayPhase[] = ['day', 'night'];

describe('rollCatch', () => {
  it('모든 장소·시간대 조합에 출현 가능한 물고기가 있다', () => {
    for (const w of waters) for (const p of phases) expect(() => rollCatch(w, p, createRng(1))).not.toThrow();
  });

  it('조건에 맞는 종만, 크기 범위 안에서 나온다', () => {
    const rng = createRng(7);
    for (const w of waters)
      for (const p of phases)
        for (let i = 0; i < 500; i++) {
          const c = rollCatch(w, p, rng);
          const s = getSpecies(c.speciesId)!;
          expect(speciesAvailable(s, w, p)).toBe(true);
          expect(c.sizeCm).toBeGreaterThanOrEqual(s.minCm);
          expect(c.sizeCm).toBeLessThanOrEqual(s.maxCm);
        }
  });

  it('희귀도 비율이 가중치를 따른다 (호수·밤: 세 등급 모두 존재)', () => {
    const rng = createRng(99);
    const n = 20000;
    const counts = { common: 0, rare: 0, legendary: 0 };
    for (let i = 0; i < n; i++) counts[getSpecies(rollCatch('lake', 'night', rng).speciesId)!.rarity]++;
    const total = RARITY_WEIGHT.common + RARITY_WEIGHT.rare + RARITY_WEIGHT.legendary;
    expect(counts.legendary / n).toBeCloseTo(RARITY_WEIGHT.legendary / total, 1);
    expect(counts.common / n).toBeCloseTo(RARITY_WEIGHT.common / total, 1);
  });

  it('전설 물고기는 해당 시간대에만 나온다', () => {
    const rng = createRng(3);
    for (let i = 0; i < 5000; i++) expect(rollCatch('sea', 'day', rng).speciesId).not.toBe('moon-ray');
  });

  it('종 id가 겹치지 않는다', () => {
    expect(new Set(FISH_SPECIES.map((s) => s.id)).size).toBe(FISH_SPECIES.length);
  });
});

describe('입질', () => {
  it('대기 시간은 3~15초', () => {
    const rng = createRng(5);
    for (let i = 0; i < 1000; i++) {
      const d = rollBiteDelay(rng);
      expect(d).toBeGreaterThanOrEqual(3);
      expect(d).toBeLessThan(15);
    }
  });

  it('너무 빠르거나 늦은 반응은 무효', () => {
    expect(isValidReaction(0.01)).toBe(false);
    expect(isValidReaction(0.4)).toBe(true);
    expect(isValidReaction(1.2)).toBe(false);
  });
});

describe('catchTier', () => {
  const s = (id: string) => getSpecies(id)!;
  it('전설 등급 물고기는 크기와 상관없이 legend', () => {
    expect(catchTier(s('moon-ray'), 80)).toBe('legend');
  });
  it('희귀 물고기와 상위 30% 크기는 big', () => {
    expect(catchTier(s('carp'), 31)).toBe('big');
    expect(catchTier(s('mackerel'), 44)).toBe('big');
  });
  it('작은 종의 작은 개체는 small, 그 사이는 medium', () => {
    expect(catchTier(s('minnow'), 7)).toBe('small');
    expect(catchTier(s('mackerel'), 32)).toBe('medium');
  });
});
