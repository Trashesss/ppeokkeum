import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

/** 0단계: 브라우저에 저장. 1단계: 서버 PostgreSQL 로 옮긴다 (E1). */
export interface DexEntry {
  count: number;
  bestCm: number;
  firstAt: number;
}

export const AVATAR_COLORS = ['#e8836b', '#f2b45a', '#7fbf7a', '#5fa8c9', '#9b86d6', '#e58fb2'] as const;

interface Profile {
  nickname: string;
  color: string;
  dex: Record<string, DexEntry>;
  total: number;
  kept: number;
  released: number;
  setIdentity: (nickname: string, color: string) => void;
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
      color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]!,
      dex: {},
      total: 0,
      kept: 0,
      released: 0,
      setIdentity: (nickname, color) => set({ nickname, color }),
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
      partialize: ({ nickname, color, dex, total, kept, released }) => ({ nickname, color, dex, total, kept, released }),
    },
  ),
);
