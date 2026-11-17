import { Object3D, Vector3 } from 'three';
import type { CatchTier, Seat } from '@fishing/shared';

/** 상체 동작. 다리(걷기·앉기)는 speed 와 seat 으로 따로 정한다. */
export type Pose = 'idle' | 'charge' | 'cast' | 'hold' | 'bite' | 'reel' | 'heave' | 'carry' | 'brag' | 'throwCharge' | 'throw' | 'pickup';

export interface HeldFish {
  speciesId: string;
  sizeCm: number;
  tier: CatchTier;
}

/** 들고 있는 자세: 한 손 / 두 손 가슴 앞 / 머리 위 */
export type CarryStyle = 'one' | 'two' | 'overhead';

export function carryStyle(tier: CatchTier): CarryStyle {
  return tier === 'small' ? 'one' : tier === 'medium' ? 'two' : 'overhead';
}

/** 매 프레임 바뀌는 로컬 플레이어 상태. React state 가 아니라 가변 객체로 둔다. */
export const player = {
  pos: new Vector3(),
  yaw: 0,
  speed: 0,
  seat: null as Seat | null,
  pose: 'idle' as Pose,
  /** 포즈 전환 후 경과 시간 (스윙 연출용) */
  poseTime: 0,
  rodTip: new Object3D(),
  hasRod: false,
  /** 낚싯대 휨 (0 = 곧음, 1.3 = 크게 휨) */
  rodBend: 0,
  struggling: false,
  held: null as HeldFish | null,
};

export function setPose(p: Pose) {
  if (player.pose !== p) {
    player.pose = p;
    player.poseTime = 0;
  }
}

export const camState = { yaw: Math.PI, pitch: 0.5, dist: 9 };
