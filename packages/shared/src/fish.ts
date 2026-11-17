import type { DayPhase } from './time.ts';

export type WaterType = 'lake' | 'river' | 'sea';
export type Rarity = 'common' | 'rare' | 'legendary';

export interface FishSpecies {
  id: string;
  name: string;
  waters: readonly WaterType[];
  /** 특정 시간대에만 나오면 지정 */
  phase?: DayPhase;
  rarity: Rarity;
  minCm: number;
  maxCm: number;
  /** 몸 색, 배 색 (저폴리 모델·도감 아이콘) */
  colors: readonly [string, string];
  /** 0~1. 끌어올릴 때 당기는 힘 */
  strength: number;
  description: string;
}

export const WATER_LABEL: Record<WaterType, string> = { lake: '호수', river: '강', sea: '바다' };
export const RARITY_LABEL: Record<Rarity, string> = { common: '일반', rare: '희귀', legendary: '전설' };

export const FISH_SPECIES: readonly FishSpecies[] = [
  { id: 'crucian', name: '붕어', waters: ['lake'], rarity: 'common', minCm: 12, maxCm: 35, colors: ['#8a8f5a', '#d8d2a0'], strength: 0.25, description: '호수의 터줏대감. 느긋하게 입질한다.' },
  { id: 'bluegill', name: '블루길', waters: ['lake'], rarity: 'common', minCm: 8, maxCm: 22, colors: ['#4e6f8c', '#e0b25a'], strength: 0.2, description: '작지만 호기심이 많아 금방 문다.' },
  { id: 'carp', name: '잉어', waters: ['lake', 'river'], rarity: 'rare', minCm: 30, maxCm: 90, colors: ['#b0763c', '#f0cf8a'], strength: 0.55, description: '힘이 세서 천천히 달래야 한다.' },
  { id: 'catfish', name: '메기', waters: ['lake'], phase: 'night', rarity: 'rare', minCm: 30, maxCm: 100, colors: ['#4a4640', '#a59d8a'], strength: 0.6, description: '밤이 되면 바닥에서 올라온다.' },
  { id: 'golden-carp', name: '황금잉어', waters: ['lake'], rarity: 'legendary', minCm: 60, maxCm: 120, colors: ['#e8b22e', '#fff0b0'], strength: 0.8, description: '호수에 산다는 소문만 무성한 물고기.' },
  { id: 'minnow', name: '피라미', waters: ['river'], rarity: 'common', minCm: 6, maxCm: 15, colors: ['#8fa7b4', '#f2e6e0'], strength: 0.15, description: '물살을 따라 반짝이며 헤엄친다.' },
  { id: 'trout', name: '송어', waters: ['river'], phase: 'day', rarity: 'common', minCm: 20, maxCm: 50, colors: ['#6d8a6a', '#e9a3a0'], strength: 0.35, description: '맑은 낮의 강을 좋아한다.' },
  { id: 'mandarin', name: '쏘가리', waters: ['river'], rarity: 'rare', minCm: 20, maxCm: 55, colors: ['#9a8a3e', '#e6d9a2'], strength: 0.5, description: '바위 틈에 숨어 사는 강의 사냥꾼.' },
  { id: 'mackerel', name: '고등어', waters: ['sea'], rarity: 'common', minCm: 20, maxCm: 45, colors: ['#3d6f86', '#dfe8ea'], strength: 0.35, description: '부두 근처에 떼를 지어 다닌다.' },
  { id: 'horse-mackerel', name: '전갱이', waters: ['sea'], rarity: 'common', minCm: 15, maxCm: 40, colors: ['#7f9aa3', '#eef0e6'], strength: 0.3, description: '저녁 무렵 부두에서 잘 잡힌다.' },
  { id: 'red-seabream', name: '참돔', waters: ['sea'], phase: 'day', rarity: 'rare', minCm: 30, maxCm: 80, colors: ['#d8686a', '#f6d1c8'], strength: 0.6, description: '바다의 귀한 손님. 분홍빛이 곱다.' },
  { id: 'moon-ray', name: '달빛가오리', waters: ['sea'], phase: 'night', rarity: 'legendary', minCm: 80, maxCm: 160, colors: ['#4b5d9c', '#cfe0ff'], strength: 0.85, description: '보름달 아래 바다 위로 떠오른다는 가오리.' },
];

export function getSpecies(id: string): FishSpecies | undefined {
  return FISH_SPECIES.find((s) => s.id === id);
}

export function speciesAvailable(s: FishSpecies, water: WaterType, phase: DayPhase): boolean {
  return s.waters.includes(water) && (s.phase === undefined || s.phase === phase);
}
