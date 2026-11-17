import { create } from 'zustand';

export type FishingPhase =
  | 'idle'
  | 'charging'
  | 'casting'
  | 'waiting'
  | 'bite'
  | 'reeling'
  /** 물 밖으로 날아오르는 연출 */
  | 'landing'
  /** 손에 들고 있음 (걸어 다닐 수 있음) */
  | 'holding'
  | 'throwCharge'
  | 'throwing';

/** 이 단계에서 움직이면 낚시를 거둔다 */
export const ACTIVE_FISHING: readonly FishingPhase[] = ['charging', 'casting', 'waiting', 'bite', 'reeling'];

export interface GroundFishItem {
  id: number;
  speciesId: string;
  sizeCm: number;
  x: number;
  y: number;
  z: number;
}

export interface CatchResult {
  speciesId: string;
  sizeCm: number;
  isNew: boolean;
  isRecord: boolean;
}

interface GameUi {
  started: boolean;
  phase: FishingPhase;
  charge: number;
  chargeLabel: string;
  reel: { tension: number; progress: number; surging: boolean } | null;
  result: CatchResult | null;
  fishPrompt: string | null;
  seatPrompt: string | null;
  sitting: boolean;
  toast: { id: number; text: string } | null;
  dexOpen: boolean;
  muted: boolean;
  tod: number;
  /** 날아가는 물고기 (렌더링용) */
  flying: { speciesId: string; sizeCm: number } | null;
  /** 손에 든 물고기 종 (아바타 다시 그리기용) */
  heldSpeciesId: string | null;
  groundFish: GroundFishItem[];
  flash: { id: number; color: string } | null;
}

export const useGame = create<GameUi>()(() => ({
  started: false,
  phase: 'idle',
  charge: 0,
  chargeLabel: '던지는 힘',
  reel: null,
  result: null,
  fishPrompt: null,
  seatPrompt: null,
  sitting: false,
  toast: null,
  dexOpen: false,
  muted: false,
  tod: 0.4,
  flying: null,
  heldSpeciesId: null,
  groundFish: [],
  flash: null,
}));

let toastId = 0;
export function showToast(text: string) {
  useGame.setState({ toast: { id: ++toastId, text } });
}

/** 값이 바뀔 때만 setState (매 프레임 호출해도 리렌더가 늘지 않게) */
export function patchGame(p: Partial<GameUi>) {
  const s = useGame.getState();
  for (const k in p) {
    if (s[k as keyof GameUi] !== p[k as keyof GameUi]) {
      useGame.setState(p);
      return;
    }
  }
}
