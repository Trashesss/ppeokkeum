/** 실제 20분 = 게임 속 하루. 서버 시각 기준이라 모두 같은 하늘을 본다. */
export const DAY_LENGTH_MS = 20 * 60 * 1000;

/** 0 = 자정, 0.25 = 오전 6시, 0.5 = 정오, 0.75 = 오후 6시 */
export function timeOfDay(nowMs: number): number {
  const t = (nowMs % DAY_LENGTH_MS) / DAY_LENGTH_MS;
  return t < 0 ? t + 1 : t;
}

export type DayPhase = 'day' | 'night';

export function dayPhase(t: number): DayPhase {
  return t >= 0.25 && t < 0.75 ? 'day' : 'night';
}

/** 게임 속 시각을 "HH:MM" 으로 */
export function formatClock(t: number): string {
  const minutes = Math.floor(t * 24 * 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
