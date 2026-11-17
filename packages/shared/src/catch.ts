import { FISH_SPECIES, speciesAvailable, type FishSpecies, type Rarity, type WaterType } from './fish.ts';
import { randRange, type Rng } from './rng.ts';
import type { DayPhase } from './time.ts';

/** 희귀도 등급별 확률 가중치. 등급을 먼저 고르고 그 안에서 종을 고른다. */
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 72, rare: 24, legendary: 4 };

export interface CatchRoll {
  speciesId: string;
  /** 소수점 첫째 자리까지 */
  sizeCm: number;
}

export function rollCatch(water: WaterType, phase: DayPhase, rng: Rng): CatchRoll {
  const pool = FISH_SPECIES.filter((s) => speciesAvailable(s, water, phase));
  if (pool.length === 0) throw new Error(`출현 가능한 물고기가 없습니다: ${water}/${phase}`);

  const tiers = (Object.keys(RARITY_WEIGHT) as Rarity[]).filter((r) => pool.some((s) => s.rarity === r));
  const total = tiers.reduce((sum, r) => sum + RARITY_WEIGHT[r], 0);
  let pick = rng() * total;
  let tier: Rarity = tiers[tiers.length - 1]!;
  for (const r of tiers) {
    pick -= RARITY_WEIGHT[r];
    if (pick < 0) {
      tier = r;
      break;
    }
  }
  const candidates = pool.filter((s) => s.rarity === tier);
  const species = candidates[Math.floor(rng() * candidates.length)]!;
  return { speciesId: species.id, sizeCm: rollSize(species, rng) };
}

/** 큰 개체일수록 드물게 (제곱 분포) */
export function rollSize(species: FishSpecies, rng: Rng): number {
  const r = rng();
  return Math.round((species.minCm + (species.maxCm - species.minCm) * r * r) * 10) / 10;
}

/** 크기 백분위 0~1 (대물 연출용) */
export function sizeRatio(species: FishSpecies, sizeCm: number): number {
  return (sizeCm - species.minCm) / (species.maxCm - species.minCm);
}

export const BITE_DELAY_MIN_S = 3;
export const BITE_DELAY_MAX_S = 15;
/** 입질 후 반응해야 하는 시간 */
export const BITE_WINDOW_S = 1;
/** 사람이 반응할 수 없을 만큼 빠른 입력은 서버가 거부한다 (D7) */
export const MIN_REACTION_S = 0.08;

export function rollBiteDelay(rng: Rng): number {
  return randRange(rng, BITE_DELAY_MIN_S, BITE_DELAY_MAX_S);
}

/** 입질 신호 후 반응까지 걸린 시간이 정상 범위인지 */
export function isValidReaction(reactionS: number): boolean {
  return reactionS >= MIN_REACTION_S && reactionS <= BITE_WINDOW_S;
}

/** 낚아올리기 연출 등급 (모션·들기 자세·카메라 연출이 달라진다) */
export type CatchTier = 'small' | 'medium' | 'big' | 'legend';

export function catchTier(species: FishSpecies, sizeCm: number): CatchTier {
  if (species.rarity === 'legendary') return 'legend';
  const r = sizeRatio(species, sizeCm);
  if (species.rarity === 'rare' || r >= 0.7) return 'big';
  if (r < 0.4 && species.maxCm <= 50) return 'small';
  return 'medium';
}
