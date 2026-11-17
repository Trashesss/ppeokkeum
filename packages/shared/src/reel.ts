import { randRange, type Rng } from './rng.ts';

/**
 * 끌어올리기 미니게임 (D4).
 * 누르고 있으면 장력이 오르고 떼면 내려간다. 안전 구간에 머무는 동안 진행도가 찬다.
 * 실패해도 페널티는 없다. 연출만 "아쉽다".
 */

export const SAFE_MIN = 0.35;
export const SAFE_MAX = 0.8;
const PULL_RATE = 0.55;
const RELAX_RATE = 0.6;
const SLACK_LIMIT_S = 2.5;
const SLACK_TENSION = 0.1;

export type ReelStatus = 'active' | 'caught' | 'snapped' | 'escaped';

export interface ReelState {
  tension: number;
  progress: number;
  elapsed: number;
  slackTime: number;
  /** 남은 몸부림 시간 */
  surge: number;
  surgeCooldown: number;
  status: ReelStatus;
}

export function createReel(rng: Rng): ReelState {
  return { tension: 0.5, progress: 0, elapsed: 0, slackTime: 0, surge: 0, surgeCooldown: randRange(rng, 1.2, 2.5), status: 'active' };
}

/** 물고기 힘(0~1)에 따라 안전 구간을 다 채우는 데 걸리는 시간: 5~9초 */
export function reelDuration(strength: number): number {
  return 5 + strength * 4;
}

export function stepReel(s: ReelState, dt: number, holding: boolean, strength: number, rng: Rng): ReelState {
  if (s.status !== 'active') return s;
  let { tension, progress, slackTime, surge, surgeCooldown } = s;

  surgeCooldown -= dt;
  if (surgeCooldown <= 0) {
    surge = randRange(rng, 0.4, 0.8);
    surgeCooldown = randRange(rng, 1.4, 3.2) - strength;
  }
  const surging = surge > 0;
  surge = Math.max(0, surge - dt);

  tension += (holding ? PULL_RATE + strength * 0.35 : -RELAX_RATE) * dt;
  if (surging) tension += strength * 0.9 * dt;
  tension = Math.max(0, tension);

  if (tension >= SAFE_MIN && tension <= SAFE_MAX) progress += dt / reelDuration(strength);
  else if (tension < SAFE_MIN) progress = Math.max(0, progress - 0.04 * dt);

  slackTime = tension < SLACK_TENSION ? slackTime + dt : 0;

  let status: ReelStatus = 'active';
  if (tension >= 1) status = 'snapped';
  else if (slackTime >= SLACK_LIMIT_S) status = 'escaped';
  else if (progress >= 1) status = 'caught';

  return { tension: Math.min(1, tension), progress: Math.min(1, progress), elapsed: s.elapsed + dt, slackTime, surge, surgeCooldown, status };
}

export function surging(s: ReelState): boolean {
  return s.surge > 0;
}
