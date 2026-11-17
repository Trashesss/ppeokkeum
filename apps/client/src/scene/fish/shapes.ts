import type { FishSpecies } from '@fishing/shared';

/**
 * 물고기 체형 명세. 몸 길이를 1로 두고 비율로 적는다.
 * t 는 몸통 위 위치: 0 = 꼬리자루, 1 = 주둥이 끝.
 */
export interface FinSpec {
  from: number;
  to: number;
  height: number;
}

export interface FishShape {
  kind: 'fish' | 'ray';
  /** 등쪽 최대 반높이 */
  height: number;
  /** 최대 반폭 */
  width: number;
  /** 가장 높은 지점 (t) */
  peak: number;
  /** 꼬리자루 굵기 비율 */
  stalk: number;
  /** 주둥이 모양: 1보다 작으면 뭉툭, 크면 뾰족 */
  snout: number;
  /** 배쪽 반높이 / 등쪽 반높이 */
  bellyRatio: number;
  /** 머리가 옆으로 넓적한 정도 (메기) */
  headWiden?: number;
  tail: { kind: 'fork' | 'round' | 'square'; length: number; spread: number };
  dorsal: FinSpec[];
  anal?: FinSpec;
  adipose?: boolean;
  pectoral?: number;
  /** 몸통 마디 수 (무늬가 있으면 촘촘하게) */
  rings?: number;
  /** 수염 길이 */
  whiskers?: number;
  pattern?: { kind: 'stripes' | 'spots' | 'bars' | 'mottle' | 'scales'; color: string; density?: number };
  colors: { back: string; belly: string; fin: string };
  glow?: number;
}

export const FISH_SHAPES: Partial<Record<string, FishShape>> = {
  // 붕어: 등이 높게 솟은 납작한 몸, 긴 등지느러미, 비늘 결
  crucian: {
    kind: 'fish',
    height: 0.2,
    width: 0.07,
    peak: 0.55,
    stalk: 0.32,
    snout: 0.85,
    bellyRatio: 0.85,
    tail: { kind: 'fork', length: 0.2, spread: 0.19 },
    dorsal: [{ from: 0.28, to: 0.66, height: 0.085 }],
    anal: { from: 0.18, to: 0.3, height: 0.06 },
    pectoral: 0.08,
    pattern: { kind: 'scales', color: '#5d6340' },
    colors: { back: '#727a48', belly: '#ddd29a', fin: '#7d7550' },
  },
  // 메기: 낮고 긴 몸, 넓적한 머리, 긴 수염, 짧은 등지느러미와 아주 긴 뒷지느러미
  catfish: {
    kind: 'fish',
    height: 0.085,
    width: 0.1,
    peak: 0.72,
    stalk: 0.5,
    snout: 0.45,
    bellyRatio: 0.65,
    headWiden: 0.5,
    tail: { kind: 'round', length: 0.11, spread: 0.065 },
    dorsal: [{ from: 0.66, to: 0.72, height: 0.055 }],
    anal: { from: 0.02, to: 0.55, height: 0.045 },
    pectoral: 0.1,
    whiskers: 0.38,
    pattern: { kind: 'mottle', color: '#36322d' },
    rings: 14,
    colors: { back: '#5b564c', belly: '#c8bfa6', fin: '#6a6358' },
  },
  // 고등어: 날렵한 방추형, 깊게 갈라진 꼬리, 등의 물결 줄무늬
  mackerel: {
    kind: 'fish',
    height: 0.105,
    width: 0.075,
    peak: 0.58,
    stalk: 0.16,
    snout: 1.5,
    bellyRatio: 0.92,
    tail: { kind: 'fork', length: 0.22, spread: 0.2 },
    dorsal: [
      { from: 0.58, to: 0.7, height: 0.075 },
      { from: 0.3, to: 0.4, height: 0.045 },
    ],
    anal: { from: 0.3, to: 0.4, height: 0.04 },
    pectoral: 0.07,
    pattern: { kind: 'stripes', color: '#1d3a4c' },
    rings: 22,
    colors: { back: '#3f7990', belly: '#e8eeee', fin: '#5b7d8a' },
  },
};

/** 아직 명세가 없는 종: 색만 반영한 기본 체형 */
export function shapeFor(species: FishSpecies): FishShape {
  const own = FISH_SHAPES[species.id];
  if (own) return own;
  const [back, belly] = species.colors;
  if (species.id === 'moon-ray') {
    return {
      kind: 'ray', height: 0.07, width: 0.55, peak: 0.5, stalk: 0, snout: 1, bellyRatio: 0.6,
      tail: { kind: 'square', length: 0.5, spread: 0 }, dorsal: [],
      pattern: { kind: 'spots', color: '#bcd4ff' }, colors: { back, belly, fin: back }, glow: 0.35,
    };
  }
  return {
    kind: 'fish', height: 0.14, width: 0.075, peak: 0.55, stalk: 0.3, snout: 1, bellyRatio: 0.85,
    tail: { kind: 'fork', length: 0.2, spread: 0.17 },
    dorsal: [{ from: 0.35, to: 0.62, height: 0.07 }],
    anal: { from: 0.22, to: 0.32, height: 0.05 },
    pectoral: 0.07,
    colors: { back, belly, fin: back },
    glow: species.rarity === 'legendary' ? 0.4 : 0,
  };
}
