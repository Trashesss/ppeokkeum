import { createPortal, useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import {
  AnimationClip, AnimationMixer, CanvasTexture, LoopOnce, LoopRepeat, Matrix4, Quaternion, SRGBColorSpace, Vector3,
  type AnimationAction, type Group, type Object3D,
} from 'three';
import { getSpecies } from '@fishing/shared';
import { fishDisplayLength } from '../game/fx';
import { JUMP, MOVE, carryStyle, type HeldFish, type JumpPhase, type Pose } from '../game/player';
import { useCharacterModel, useClips, type CharacterId } from './character/assets';
import { measureGait, type Gait } from './character/gait';
import { FishMesh, type FlopControl } from './fish/FishMesh';

/** 아바타가 읽는 상태. 1단계에서 다른 플레이어도 같은 모양으로 동기화한다. */
export interface AvatarState {
  pose: Pose;
  poseTime: number;
  speed: number;
  seat: unknown;
  hasRod: boolean;
  rodBend: number;
  /** 물고기가 몸부림치는 중 (끌어올리기 애니메이션 전환) */
  struggling: boolean;
  held: HeldFish | null;
  jump: JumpPhase;
  /** 현재 점프 단계에 들어온 뒤 경과 시간 */
  jumpTime: number;
}

interface Props {
  state: AvatarState;
  character: CharacterId;
  /** 손에 든 물고기 종. 바뀔 때 다시 그리도록 prop 으로 받는다 */
  heldSpeciesId: string | null;
  name: string;
  /** 낚싯대 끝 위치를 받을 객체 (낚싯줄 연결용) */
  rodTip?: Object3D;
}

/** KayKit 캐릭터(약 2.2 단위)를 맵 비율(약 1.7m)에 맞춘다 */
const SCALE = 0.78;
/** 큰 머리 비율을 조금 줄인다 (머리 뼈 크기). 애니메이션이 덮어쓰지 않도록 매 프레임 적용 */
const HEAD_SCALE = 0.85;
const ROD_SEGS = [0.55, 0.55, 0.55, 0.55];
const BEND_WEIGHT = [0.08, 0.18, 0.3, 0.44];
/** 손잡이 끝이 손보다 조금 뒤에 오도록 */
const ROD_GRIP_BACK = 0.35;
/** 차징 동안 멈춰 둘 "젖힌 순간" (정규화 시각) */
const CAST_WINDUP = 0.42;
const THROW_WINDUP = 0.45;
/**
 * Sit_Chair_Idle 은 엉덩이를 발 기준 약 0.31m 뒤, 앉는 높이 약 0.35m 를 가정한다 (측정값).
 * 벤치 좌석(0.5m) 가운데에 엉덩이가 오도록 앉을 때만 모델을 옮긴다.
 */
const SIT_FORWARD = 0.25;
const SIT_LIFT = 0.15;

/** 상체 뼈 (GLTFLoader 가 이름의 점을 지운다: upperarm.l → upperarml) */
const UPPER = new Set(['spine', 'chest', 'head', 'upperarml', 'upperarmr', 'lowerarml', 'lowerarmr', 'wristl', 'wristr', 'handl', 'handr', 'handslotl', 'handslotr']);
type Variant = 'full' | 'upper' | 'lower';

function maskClip(clip: AnimationClip, variant: Variant): AnimationClip {
  if (variant === 'full') return clip;
  const keepUpper = variant === 'upper';
  const tracks = clip.tracks.filter((t) => UPPER.has(t.name.split('.')[0]!) === keepUpper);
  return new AnimationClip(`${clip.name}:${variant}`, clip.duration, tracks);
}

interface UpperSpec {
  clip: string;
  once?: boolean;
  /** 이 시점(0~1)까지 재생하고 멈춘다 */
  pauseAt?: number;
}

function upperFor(state: AvatarState): UpperSpec | null {
  const style = state.held ? carryStyle(state.held.tier) : 'one';
  switch (state.pose) {
    case 'charge':
      return { clip: 'Fishing_Cast', pauseAt: CAST_WINDUP };
    case 'cast':
      return { clip: 'Fishing_Cast', once: true };
    case 'hold':
      return { clip: 'Fishing_Idle' };
    case 'bite':
      return { clip: 'Fishing_Bite' };
    case 'reel':
      return { clip: state.struggling ? 'Fishing_Struggling' : 'Fishing_Reeling' };
    case 'heave':
      return { clip: 'Fishing_Catch', once: true };
    case 'carry':
      return { clip: style === 'one' ? 'Holding_C' : style === 'two' ? 'Holding_B' : 'Holding_A' };
    case 'brag':
      return { clip: 'Cheering' };
    case 'throwCharge':
      return { clip: 'Throw', pauseAt: THROW_WINDUP };
    case 'throw':
      return { clip: 'Throw', once: true };
    case 'pickup':
      return { clip: 'PickUp', once: true };
    default:
      return null;
  }
}

/** 이 속도(m/s) 아래면 멈춘 것으로 본다 */
const MOVING_EPS = 0.05;
/** 하체 가중치가 목표를 따라가는 빠르기 (앉기·상체 전환 같은 끊기는 변화를 부드럽게) */
const BASE_BLEND_RATE = 10;
/** 점프 중에는 자세가 빨리 바뀌어야 해서 더 빠르게 섞는다 */
const JUMP_BLEND_RATE = 25;
const IDLE = 'Idle_A';
/**
 * 이동 클립과 그 클립이 온전히 재생되는 속도. 사이 속도에서는 이웃 클립끼리 섞는다.
 * 0 → 서기, MOVE.walk 걷기, MOVE.jog 달리기, MOVE.run 전력 질주.
 */
const GAITS = [
  { clip: 'Walking_A', at: MOVE.walk },
  { clip: 'Running_A', at: MOVE.jog },
  { clip: 'Running_B', at: MOVE.run },
] as const;

/**
 * 점프 클립 구간 (정규화 시각, 측정값).
 * Jump_Start: 0~0.45 웅크림, 0.5 에서 발이 떨어지고 0.7 부터 공중 자세.
 *   앞쪽 웅크림은 건너뛰고 START_FROM 에서 시작해 JUMP.takeoff 초 뒤에 이륙 지점에 닿게 한다.
 * Jump_Land: 0.2 에서 발이 닿고 0.8 이면 다시 선 자세.
 */
const START_FROM = 0.3;
const START_LIFTOFF = 0.5;
const START_END = 0.75;
const LAND_FROM = 0.15;
const LAND_END = 0.8;

/** 속도 → 서기 가중치와 GAITS 각 클립의 가중치 */
function locoWeights(speed: number): { idle: number; gaits: number[] } {
  const gaits = GAITS.map(() => 0);
  const first = GAITS[0].at;
  if (speed <= first) {
    gaits[0] = speed / first;
    return { idle: 1 - gaits[0], gaits };
  }
  for (let i = 1; i < GAITS.length; i++) {
    const lo = GAITS[i - 1]!.at;
    const hi = GAITS[i]!.at;
    if (speed < hi) {
      const t = (speed - lo) / (hi - lo);
      gaits[i - 1] = 1 - t;
      gaits[i] = t;
      return { idle: 0, gaits };
    }
  }
  gaits[GAITS.length - 1] = 1;
  return { idle: 0, gaits };
}

/** 하체(이동·앉기) + 상체(낚시·들기) 두 레이어로 애니메이션을 섞는다 */
class Rig {
  mixer: AnimationMixer;
  private actions = new Map<string, AnimationAction>();
  /** 하체 레이어 액션별 현재 가중치 (페이드 대신 직접 관리) */
  private baseWeights = new Map<AnimationAction, number>();
  private upper: AnimationAction | null = null;
  private upperKey = '';
  /** 걷기·달리기 공용 발 위상 (0~1, 0 = 왼발이 가장 앞) */
  private phase = 0;
  /** GAITS 순서대로 잰 보행 정보 */
  private gaits: (Gait | null)[];
  private scale: number;

  constructor(
    root: Object3D,
    private clips: Map<string, AnimationClip>,
  ) {
    this.mixer = new AnimationMixer(root);
    this.scale = root.scale.x;
    this.gaits = GAITS.map((g) => {
      const clip = clips.get(g.clip);
      return clip ? measureGait(root, clip) : null;
    });
  }

  private action(name: string, variant: Variant): AnimationAction | null {
    const key = `${name}:${variant}`;
    let a = this.actions.get(key);
    if (!a) {
      const clip = this.clips.get(name);
      if (!clip) return null;
      a = this.mixer.clipAction(maskClip(clip, variant));
      this.actions.set(key, a);
    }
    return a;
  }

  private swap(cur: AnimationAction | null, next: AnimationAction | null, fade: number) {
    if (cur === next) return;
    if (next) next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (cur) cur.fadeOut(fade);
  }

  /** 한 주기(두 걸음)에 나아가는 거리 (m) */
  private stride(g: Gait | null, clip: string): number {
    const d = this.clips.get(clip)?.duration ?? 1;
    return g ? g.speed * this.scale * d : 1;
  }

  private updateBase(state: AvatarState, spec: UpperSpec | null, layered: boolean, dt: number) {
    const sitting = !!state.seat;
    const speed = sitting ? 0 : state.speed;
    const variant: Variant = layered ? 'lower' : 'full';
    /** 액션 → 목표 가중치, 그리고 직접 정한 재생 위치(초) */
    const targets = new Map<AnimationAction, { w: number; time?: number }>();
    const add = (name: string, w: number, norm?: number) => {
      const a = this.action(name, variant);
      if (!a || w <= 0) return;
      const prev = targets.get(a);
      targets.set(a, { w: (prev?.w ?? 0) + w, time: norm === undefined ? undefined : norm * a.getClip().duration });
    };

    // 걷기·달리기는 같은 발 위상으로 맞춰 재생한다: 섞여도 발이 엇갈리지 않고,
    // 위상이 실제 이동 거리만큼 나아가니 발이 땅에 붙어 보인다
    const loco = locoWeights(speed);
    let strideSum = 0;
    let weightSum = 0;
    GAITS.forEach((g, i) => {
      strideSum += this.stride(this.gaits[i] ?? null, g.clip) * loco.gaits[i]!;
      weightSum += loco.gaits[i]!;
    });
    const stride = weightSum > 0 ? strideSum / weightSum : this.stride(this.gaits[0] ?? null, GAITS[0].clip);
    this.phase = (this.phase + (speed * dt) / stride) % 1;
    const addLoco = (scale: number) => {
      add(IDLE, loco.idle * scale);
      GAITS.forEach((g, i) => {
        const gait = this.gaits[i];
        add(g.clip, loco.gaits[i]! * scale, gait ? (this.phase + gait.phase0) % 1 : undefined);
      });
    };

    // 상체 클립이 전신으로 재생 중이면 하체는 비운다
    if (!spec || layered) {
      if (sitting) add('Sit_Chair_Idle', 1);
      else if (state.jump === 'takeoff' || state.jump === 'air') {
        // 이륙까지 START_FROM→START_LIFTOFF 를 JUMP.takeoff 초에 재생하고, 같은 빠르기로 공중 자세까지 이어 간다
        const rate = (START_LIFTOFF - START_FROM) / JUMP.takeoff;
        const startNorm =
          state.jump === 'takeoff'
            ? START_FROM + state.jumpTime * rate
            : Math.min(START_END, START_LIFTOFF + state.jumpTime * rate);
        const toIdle = state.jump === 'air' ? Math.min(1, state.jumpTime / 0.25) : 0;
        add('Jump_Start', 1 - toIdle, startNorm);
        add('Jump_Idle', toIdle);
      } else if (state.jump === 'land') {
        const dur = speed > 0.5 ? JUMP.landMoving : JUMP.land;
        const norm = LAND_FROM + (LAND_END - LAND_FROM) * Math.min(1, state.jumpTime / dur);
        // 이동 중 착지는 충격 자세를 반만 섞고 바로 뛰어 나간다
        const w = speed > 0.5 ? 0.5 : 1;
        add('Jump_Land', w, norm);
        addLoco(1 - w);
      } else addLoco(1);
    }

    const jumping = state.jump !== 'none';
    const k = 1 - Math.exp(-(jumping ? JUMP_BLEND_RATE : BASE_BLEND_RATE) * dt);
    const all = new Set([...this.baseWeights.keys(), ...targets.keys()]);
    for (const a of all) {
      const target = targets.get(a);
      const cur = this.baseWeights.get(a) ?? 0;
      const w = cur + ((target?.w ?? 0) - cur) * k;
      if (!target && w < 0.002) {
        a.stop();
        this.baseWeights.delete(a);
        continue;
      }
      if (!a.isRunning()) a.play();
      a.setEffectiveWeight(w);
      this.baseWeights.set(a, w);
      // 위치를 직접 정하는 액션은 mixer 가 시간을 흘리지 않게 한다. 사라지는 중이면 마지막 자세 유지
      if (target?.time !== undefined) {
        a.timeScale = 0;
        a.time = target.time;
      } else if (!target && a.timeScale === 0) {
        // 그대로 둔다
      } else a.timeScale = 1;
    }
  }

  update(state: AvatarState, dt: number) {
    const sitting = !!state.seat;
    const moving = !sitting && state.speed > MOVING_EPS;
    const spec = upperFor(state);
    // 앉아 있거나 걷거나 뛰는 중이면 하체는 이동·앉기·점프, 상체만 낚시·들기 동작
    const layered = !!spec && (sitting || moving || state.jump !== 'none');
    this.updateBase(state, spec, layered, dt);

    const variant: Variant = layered ? 'upper' : 'full';
    const key = spec ? `${spec.clip}:${variant}` : '';
    if (key !== this.upperKey) {
      const next = spec ? this.action(spec.clip, variant) : null;
      // 차징 → 캐스팅처럼 같은 클립이면 끊지 않고 젖힌 자세에서 이어서 재생
      if (this.upper !== next) this.swap(this.upper, next, 0.18);
      this.upper = next;
      this.upperKey = key;
    }
    const u = this.upper;
    if (u && spec) {
      u.setLoop(spec.once ? LoopOnce : LoopRepeat, Infinity);
      u.clampWhenFinished = !!spec.once;
      if (spec.pauseAt !== undefined) {
        const stop = spec.pauseAt * u.getClip().duration;
        if (u.time >= stop) {
          u.time = stop;
          u.paused = true;
        }
      } else u.paused = false;
      u.timeScale = spec.once ? 1.4 : 1;
    }
    this.mixer.update(dt);
  }
}

const tmpA = new Vector3();
const tmpB = new Vector3();

export function Avatar(props: Props) {
  return (
    <Suspense fallback={null}>
      <CharacterAvatar key={props.character} {...props} />
    </Suspense>
  );
}

function CharacterAvatar({ state, character, heldSpeciesId, name, rodTip }: Props) {
  const outer = useRef<Group>(null);
  const heldRef = useRef<Group>(null);
  const tagRef = useRef<Group>(null);
  const rodRef = useRef<Group>(null);
  const segs = useRef<(Group | null)[]>([]);
  const model = useCharacterModel(character);
  const clips = useClips();
  const flop = useMemo<FlopControl>(() => ({ amp: 0.05, freq: 7 }), []);
  const heldSpecies = heldSpeciesId ? getSpecies(heldSpeciesId) : undefined;

  const bones = useMemo(() => {
    model.scale.setScalar(SCALE);
    return {
      slotR: model.getObjectByName('handslotr'),
      handR: model.getObjectByName('handr'),
      handL: model.getObjectByName('handl'),
      head: model.getObjectByName('head'),
    };
  }, [model]);

  const rig = useMemo(() => new Rig(model, clips), [model, clips]);
  useEffect(
    () => () => {
      rig.mixer.stopAllAction();
    },
    [rig],
  );

  /**
   * 낚싯대 장착 방향: Fishing_Idle 자세에서 손 소켓 기준으로
   * "캐릭터 앞쪽 위 35도"가 낚싯대 방향(+Y), "아래"가 휘는 방향(+Z)이 되도록 맞춘다.
   * 소켓 축을 하드코딩하지 않아 캐릭터가 바뀌어도 그대로 맞는다.
   */
  const rodMount = useMemo(() => {
    const slot = bones.slotR;
    const clip = clips.get('Fishing_Idle');
    if (!slot || !clip) return { quaternion: new Quaternion(), scale: 1 };
    const probe = new AnimationMixer(model);
    probe.clipAction(clip).play();
    probe.update(clip.duration * 0.2);
    model.updateWorldMatrix(true, true);
    const slotInRoot = new Matrix4().multiplyMatrices(new Matrix4().copy(model.matrixWorld).invert(), slot.matrixWorld);
    const slotQ = new Quaternion();
    const slotS = new Vector3();
    slotInRoot.decompose(new Vector3(), slotQ, slotS);
    const dir = new Vector3(0, Math.sin(0.6), Math.cos(0.6));
    const down = new Vector3(0, -1, 0).addScaledVector(dir, dir.y).normalize();
    const inv = slotQ.clone().invert();
    const y = dir.applyQuaternion(inv);
    const z = down.applyQuaternion(inv);
    const x = new Vector3().crossVectors(y, z).normalize();
    const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
    probe.stopAllAction();
    probe.uncacheRoot(model);
    // 루트 스케일까지 포함한 소켓 스케일을 상쇄해 낚싯대를 미터 단위로 그린다
    return { quaternion: q, scale: 1 / (slotS.y * SCALE) };
  }, [bones.slotR, clips, model]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    rig.update(state, dt);
    bones.head?.scale.setScalar(HEAD_SCALE);
    const k = 1 - Math.exp(-10 * dt);
    model.position.y += ((state.seat ? SIT_LIFT : 0) - model.position.y) * k;
    model.position.z += ((state.seat ? SIT_FORWARD : 0) - model.position.z) * k;
    model.updateWorldMatrix(true, true);
    if (rodRef.current) rodRef.current.visible = state.hasRod;

    segs.current.forEach((s, i) => {
      if (s) s.rotation.x += (state.rodBend * BEND_WEIGHT[i]! - s.rotation.x) * (1 - Math.exp(-18 * dt));
    });

    // 손에 든 물고기: 손 뼈 위치를 따라간다
    const h = heldRef.current;
    const o = outer.current;
    if (h && o) {
      const held = state.held;
      h.visible = !!held && !!heldSpecies;
      if (held && bones.handR && bones.handL) {
        const len = fishDisplayLength(held.sizeCm);
        const oneHand = state.pose === 'throwCharge' || state.pose === 'throw' || (carryStyle(held.tier) === 'one' && state.pose !== 'brag');
        if (oneHand) {
          (bones.slotR ?? bones.handR).getWorldPosition(tmpA);
          o.worldToLocal(tmpA);
          h.position.set(tmpA.x, tmpA.y - len * 0.42, tmpA.z);
          h.rotation.set(-Math.PI / 2, 0, 0);
        } else {
          bones.handR.getWorldPosition(tmpA);
          bones.handL.getWorldPosition(tmpB);
          o.worldToLocal(tmpA);
          o.worldToLocal(tmpB);
          h.position.addVectors(tmpA, tmpB).multiplyScalar(0.5);
          h.position.y += 0.06;
          h.rotation.set(0, Math.PI / 2, 0);
        }
        h.scale.setScalar(len);
        flop.amp = state.pose === 'brag' ? 0.12 : 0.05;
        flop.freq = state.pose === 'brag' ? 14 : 7;
      }
    }
    if (tagRef.current) {
      const up = state.pose === 'brag' ? 0.5 : 0;
      tagRef.current.position.y += (up - tagRef.current.position.y) * Math.min(1, dt * 8);
    }
  });

  return (
    <group ref={outer}>
      <primitive object={model} />
      {bones.slotR &&
        createPortal(
          <group ref={rodRef} quaternion={rodMount.quaternion} scale={rodMount.scale}>
            <group position={[0, -ROD_GRIP_BACK, 0]}>
              <mesh position={[0, 0.3, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.06, 8]} />
                <meshStandardMaterial color="#c9c4bb" flatShading />
              </mesh>
              <RodSegment index={0} segs={segs} tip={rodTip} />
            </group>
          </group>,
          bones.slotR,
        )}
      <group ref={heldRef} visible={false}>
        {heldSpecies && <FishMesh species={heldSpecies} flop={flop} />}
      </group>
      <group ref={tagRef}>
        <NameTag name={name} />
      </group>
    </group>
  );
}

/** 마디가 이어진 낚싯대. 각 마디가 조금씩 휘어 전체가 활처럼 굽는다. */
function RodSegment({ index, segs, tip }: { index: number; segs: React.RefObject<(Group | null)[]>; tip?: Object3D }) {
  const len = ROD_SEGS[index]!;
  const r0 = 0.03 - index * 0.005;
  const r1 = r0 - 0.005;
  const last = index === ROD_SEGS.length - 1;
  return (
    <group
      ref={(g) => {
        segs.current[index] = g;
      }}
      position={[0, index === 0 ? 0 : ROD_SEGS[index - 1]!, 0]}
    >
      <mesh position={[0, len / 2, 0]} castShadow>
        <cylinderGeometry args={[Math.max(0.008, r1), r0, len, 5]} />
        <meshStandardMaterial color={index % 2 ? '#7a5634' : '#6b4a2e'} flatShading />
      </mesh>
      {last ? tip && <primitive object={tip} position={[0, len, 0]} /> : <RodSegment index={index + 1} segs={segs} tip={tip} />}
    </group>
  );
}

function NameTag({ name }: { name: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    if (g) {
      g.font = '600 30px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
      const w = Math.min(248, g.measureText(name).width + 28);
      g.fillStyle = 'rgba(40, 34, 30, 0.55)';
      g.beginPath();
      g.roundRect((256 - w) / 2, 10, w, 44, 22);
      g.fill();
      g.fillStyle = '#fffaf0';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(name, 128, 33);
    }
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [name]);
  return (
    <sprite position={[0, 2.05, 0]} scale={[1.6, 0.4, 1]}>
      <spriteMaterial map={texture} depthWrite={false} transparent />
    </sprite>
  );
}
