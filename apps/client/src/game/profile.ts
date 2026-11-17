import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { CHARACTERS, type CharacterId } from '../scene/character/assets';

/** 0단계: 브라우저에 저장. 1단계: 서버 PostgreSQL 로 옮긴다 (E1). */
export interface DexEntry {
  count: number;
  bestCm: number;
  firstAt: number;
}

interface Profile {
  nickname: string;
  character: CharacterId;
  dex: Record<string, DexEntry>;
  total: number;
  kept: number;
  released: number;
  setIdentity: (nickname: string, character: CharacterId) => void;
  /** 잡은 순간 도감에 기록. 처음 잡았는지, 최고 기록인지 돌려준다. */
  recordCatch: (speciesId: string, sizeCm: number) => { isNew: boolean; isRecord: boolean };
  settle: (keep: boolean) => void;
}

const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* 저장 불가 환경: 이번 세션에서만 유지 */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* noop */
    }
  },
};

const STORAGE_KEY = 'ppeokkeum-profile-v1';
/** 이름을 바꾸기 전 키. 남아 있으면 한 번만 새 키로 옮겨 도감을 잃지 않게 한다 */
const LEGACY_KEY = 'yunseul-profile-v1';
try {
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy && !localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, legacy);
  localStorage.removeItem(LEGACY_KEY);
} catch {
  /* 저장소를 쓸 수 없는 환경: 옮길 것도 없다 */
}

export const useProfile = create<Profile>()(
  persist(
    (set, get) => ({
      nickname: '',
      character: CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]!,
      dex: {},
      total: 0,
      kept: 0,
      released: 0,
      setIdentity: (nickname, character) => set({ nickname, character }),
      recordCatch: (speciesId, sizeCm) => {
        const prev = get().dex[speciesId];
        const isNew = !prev;
        const isRecord = !!prev && sizeCm > prev.bestCm;
        set((s) => ({
          total: s.total + 1,
          dex: {
            ...s.dex,
            [speciesId]: { count: (prev?.count ?? 0) + 1, bestCm: Math.max(prev?.bestCm ?? 0, sizeCm), firstAt: prev?.firstAt ?? Date.now() },
          },
        }));
        return { isNew, isRecord };
      },
      settle: (keep) => set((s) => (keep ? { kept: s.kept + 1 } : { released: s.released + 1 })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ nickname, character, dex, total, kept, released }) => ({ nickname, character, dex, total, kept, released }),
    },
  ),
);
