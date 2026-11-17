import { createPortal, useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import {
  AnimationClip, AnimationMixer, CanvasTexture, LoopOnce, LoopRepeat, Matrix4, Quaternion, SRGBColorSpace, Vector3,
  type AnimationAction, type Group, type Object3D,
} from 'three';
import { getSpecies } from '@fishing/shared';
import { fishDisplayLength } from '../game/fx';
import { carryStyle, type HeldFish, type Pose } from '../game/player';
import { useCharacterModel, useClips, type CharacterId } from './character/assets';
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

/** 하체(이동·앉기) + 상체(낚시·들기) 두 레이어로 애니메이션을 섞는다 */
class Rig {
  mixer: AnimationMixer;
  private actions = new Map<string, AnimationAction>();
  private base: AnimationAction | null = null;
  private upper: AnimationAction | null = null;
  private upperKey = '';

  constructor(
    root: Object3D,
    private clips: Map<string, AnimationClip>,
  ) {
    this.mixer = new AnimationMixer(root);
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

  update(state: AvatarState, dt: number) {
    const sitting = !!state.seat;
    const moving = !sitting && state.speed > 0;
    const spec = upperFor(state);
    // 앉아 있거나 걷는 중이면 하체는 이동·앉기, 상체만 낚시·들기 동작
    const layered = !!spec && (sitting || moving);

    const baseName = sitting ? 'Sit_Chair_Idle' : state.speed > 5 ? 'Running_A' : moving ? 'Walking_A' : 'Idle_A';
    const nextBase = spec && !layered ? null : this.action(baseName, layered ? 'lower' : 'full');
    this.swap(this.base, nextBase, 0.25);
    this.base = nextBase;
    if (nextBase && moving) nextBase.timeScale = baseName === 'Running_A' ? state.speed / 6.8 : state.speed / 4.2;

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
