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
  // 블루길: 동글고 납작한 몸, 긴 가시 등지느러미, 주황빛 배와 옅은 세로 띠
  bluegill: {
    kind: 'fish', height: 0.22, width: 0.06, peak: 0.5, stalk: 0.3, snout: 0.75, bellyRatio: 0.95,
    tail: { kind: 'fork', length: 0.16, spread: 0.15 },
    dorsal: [{ from: 0.22, to: 0.72, height: 0.08 }],
    anal: { from: 0.12, to: 0.36, height: 0.07 },
    pectoral: 0.08,
    pattern: { kind: 'bars', color: '#34506a', density: 0.9 },
    colors: { back: '#4f6f86', belly: '#e3a457', fin: '#4a6175' },
  },
  // 잉어: 튼튼한 긴 몸, 짧은 수염, 굵은 비늘, 긴 등지느러미
  carp: {
    kind: 'fish', height: 0.165, width: 0.09, peak: 0.55, stalk: 0.32, snout: 0.8, bellyRatio: 0.9,
    tail: { kind: 'fork', length: 0.2, spread: 0.18 },
    dorsal: [{ from: 0.3, to: 0.7, height: 0.08 }],
    anal: { from: 0.18, to: 0.28, height: 0.06 },
    pectoral: 0.09,
    whiskers: 0.08,
    pattern: { kind: 'scales', color: '#7c5226' },
    colors: { back: '#a06e36', belly: '#f0cf8a', fin: '#a8703e' },
  },
  // 황금잉어: 잉어 체형에 금빛 비늘과 은은한 발광
  'golden-carp': {
    kind: 'fish', height: 0.17, width: 0.09, peak: 0.55, stalk: 0.32, snout: 0.8, bellyRatio: 0.9,
    tail: { kind: 'fork', length: 0.24, spread: 0.22 },
    dorsal: [{ from: 0.28, to: 0.72, height: 0.1 }],
    anal: { from: 0.16, to: 0.28, height: 0.07 },
    pectoral: 0.11,
    whiskers: 0.1,
    pattern: { kind: 'scales', color: '#c9930f' },
    colors: { back: '#eab52f', belly: '#fff2b8', fin: '#f4c95a' },
    glow: 0.45,
  },
  // 피라미: 가늘고 날씬한 몸, 분홍·청록 혼인색 세로 띠, 큰 뒷지느러미
  minnow: {
    kind: 'fish', height: 0.085, width: 0.05, peak: 0.55, stalk: 0.3, snout: 1.3, bellyRatio: 0.9,
    tail: { kind: 'fork', length: 0.18, spread: 0.13 },
    dorsal: [{ from: 0.42, to: 0.55, height: 0.06 }],
    anal: { from: 0.16, to: 0.36, height: 0.075 },
    pectoral: 0.06,
    rings: 16,
    pattern: { kind: 'bars', color: '#d68ca1', density: 1.4 },
    colors: { back: '#7d98a8', belly: '#f3e8e2', fin: '#e6a3b2' },
  },
  // 송어: 방추형 몸, 검은 점무늬, 기름지느러미, 거의 곧은 꼬리
  trout: {
    kind: 'fish', height: 0.12, width: 0.07, peak: 0.5, stalk: 0.32, snout: 1.1, bellyRatio: 0.92,
    tail: { kind: 'square', length: 0.16, spread: 0.13 },
    dorsal: [{ from: 0.45, to: 0.6, height: 0.07 }],
    anal: { from: 0.18, to: 0.28, height: 0.05 },
    adipose: true,
    pectoral: 0.07,
    rings: 20,
    pattern: { kind: 'spots', color: '#2d3a2b', density: 1.1 },
    colors: { back: '#6d8a6a', belly: '#f1d4cb', fin: '#7c8f6c' },
  },
  // 쏘가리: 큰 머리와 뾰족한 주둥이, 표범 무늬, 가시 등지느러미
  mandarin: {
    kind: 'fish', height: 0.15, width: 0.075, peak: 0.45, stalk: 0.34, snout: 1.25, bellyRatio: 0.85,
    tail: { kind: 'round', length: 0.14, spread: 0.12 },
    dorsal: [{ from: 0.2, to: 0.68, height: 0.1 }],
    anal: { from: 0.14, to: 0.3, height: 0.07 },
    pectoral: 0.09,
    rings: 20,
    pattern: { kind: 'spots', color: '#463a18', density: 1.6 },
    colors: { back: '#a28d42', belly: '#efe2ad', fin: '#8f7d3c' },
  },
  // 전갱이: 고등어보다 높은 몸, 노란빛 꼬리, 무늬 없음
  'horse-mackerel': {
    kind: 'fish', height: 0.13, width: 0.065, peak: 0.55, stalk: 0.16, snout: 1.2, bellyRatio: 0.95,
    tail: { kind: 'fork', length: 0.22, spread: 0.2 },
    dorsal: [
      { from: 0.48, to: 0.62, height: 0.07 },
      { from: 0.2, to: 0.44, height: 0.045 },
    ],
    anal: { from: 0.2, to: 0.4, height: 0.045 },
    pectoral: 0.09,
    colors: { back: '#7a97a2', belly: '#eef0e6', fin: '#c9c07a' },
  },
  // 참돔: 높게 솟은 등, 가파른 이마, 분홍 몸에 푸른 점
  'red-seabream': {
    kind: 'fish', height: 0.21, width: 0.07, peak: 0.6, stalk: 0.26, snout: 0.9, bellyRatio: 0.8,
    tail: { kind: 'fork', length: 0.2, spread: 0.19 },
    dorsal: [{ from: 0.24, to: 0.7, height: 0.1 }],
    anal: { from: 0.16, to: 0.32, height: 0.07 },
    pectoral: 0.11,
    rings: 18,
    pattern: { kind: 'spots', color: '#86cde8', density: 0.45 },
    colors: { back: '#d9676c', belly: '#f7d3c9', fin: '#e2787c' },
  },
  // 달빛가오리: 납작한 원반 몸, 은은하게 빛나는 점무늬, 긴 꼬리
  'moon-ray': {
    kind: 'ray', height: 0.07, width: 0.55, peak: 0.5, stalk: 0, snout: 1, bellyRatio: 0.6,
    tail: { kind: 'square', length: 0.5, spread: 0 }, dorsal: [],
    pattern: { kind: 'spots', color: '#bcd4ff' },
    colors: { back: '#4b5d9c', belly: '#cfe0ff', fin: '#4b5d9c' },
    glow: 0.35,
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
