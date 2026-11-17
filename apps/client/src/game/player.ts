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

/**
 * 이동 속도 (m/s). 클립이 발로 땅을 미는 속도(Walking_A 약 0.57, Running_A 약 2.25, Running_B 약 3.3)에
 * 가깝게 잡아 재생 배속이 1.6 을 넘지 않게 한다. 크게 벗어나면 발이 미끄러지거나 다리가 헛돈다.
 * - walk: 물고기를 든 채 걷기 (Walking_A 약 1.75배)
 * - jog: 기본 이동 (Running_A 약 1.5배)
 * - run: Shift 전력 질주 (Running_B 약 1.5배)
 * Avatar 는 이 세 값을 각 클립이 온전히 재생되는 블렌드 지점으로 쓴다.
 */
export const MOVE = { walk: 1.0, jog: 3.4, run: 5.0 } as const;

/**
 * 점프 단계. 다리 애니메이션과 물리가 같이 본다.
 * takeoff(살짝 웅크림) → air(공중) → land(착지 충격) → none
 */
export type JumpPhase = 'none' | 'takeoff' | 'air' | 'land';

/** 점프 수치. 높이 = speed² / (2·gravity) ≈ 0.69m, 체공 ≈ 0.5초 */
export const JUMP = {
  /** 점프 키를 누르고 발이 떨어지기까지 (웅크림) */
  takeoff: 0.08,
  speed: 5.5,
  gravity: 22,
  /** 착지 충격 자세를 유지하는 시간: 서 있을 때 / 이동 중 */
  land: 0.33,
  landMoving: 0.18,
} as const;

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
  jump: 'none' as JumpPhase,
  /** 현재 점프 단계에 들어온 뒤 경과 시간 */
  jumpTime: 0,
  /** 수직 속도 (공중일 때만) */
  vy: 0,
};

export function setPose(p: Pose) {
  if (player.pose !== p) {
    player.pose = p;
    player.poseTime = 0;
  }
}

export const camState = { yaw: Math.PI, pitch: 0.5, dist: 9 };
