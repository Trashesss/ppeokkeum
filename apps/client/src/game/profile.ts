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
      name: 'yunseul-profile-v1',
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ nickname, character, dex, total, kept, released }) => ({ nickname, character, dex, total, kept, released }),
    },
  ),
);
