import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CanvasTexture, SRGBColorSpace, type Group, type Object3D } from 'three';
import { getSpecies } from '@fishing/shared';
import { fishDisplayLength } from '../game/fx';
import { carryStyle, type HeldFish, type Pose } from '../game/player';
import { FishMesh, type FlopControl } from './fish/FishMesh';

/** 아바타가 읽는 상태. 1단계에서 다른 플레이어도 같은 모양으로 동기화한다. */
export interface AvatarState {
  pose: Pose;
  poseTime: number;
  speed: number;
  seat: unknown;
  hasRod: boolean;
  rodBend: number;
  held: HeldFish | null;
}

interface Props {
  state: AvatarState;
  /** 손에 든 물고기 종. 바뀔 때 다시 그리도록 prop 으로 받는다 */
  heldSpeciesId: string | null;
  color: string;
  name: string;
  /** 낚싯대 끝 위치를 받을 객체 (낚싯줄 연결용) */
  rodTip?: Object3D;
}

const SKIN = '#f3d2b5';
const PANTS = '#5a5f7a';
const HAT = '#f0e2c0';
const ARM_LEN = 0.52;
const SHOULDER_Y = 1.2;
const SHOULDER_X = 0.36;
/** 낚싯대 마디별 휨 비율 (끝으로 갈수록 많이 휜다) */
const ROD_SEGS = [0.55, 0.55, 0.55, 0.55];
const BEND_WEIGHT = [0.08, 0.18, 0.3, 0.44];

const damp = (cur: number, target: number, k: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-k * dt));

interface ArmTarget {
  aL: number;
  aR: number;
  /** 팔 벌림 (z 회전) */
  sL: number;
  sR: number;
  lean: number;
  bodyY: number;
}

function armsFor(state: AvatarState, walkSwing: number, now: number): ArmTarget {
  const t: ArmTarget = { aL: -walkSwing * 0.8, aR: walkSwing * 0.8, sL: 0, sR: 0, lean: 0, bodyY: Math.sin(now / 700) * 0.015 };
  const pt = state.poseTime;
  const style = state.held ? carryStyle(state.held.tier) : 'one';
  switch (state.pose) {
    case 'charge':
      Object.assign(t, { aR: 2.6, aL: -0.6, lean: -0.12 });
      break;
    case 'cast':
      Object.assign(t, { aR: pt < 0.15 ? 2.6 - (pt / 0.15) * 3.8 : -1.2, aL: -0.5, lean: 0.12 });
      break;
    case 'hold':
      Object.assign(t, { aR: -0.9, aL: -0.5 });
      break;
    case 'reel':
      Object.assign(t, {
        aR: -0.9 + Math.sin(now / 90) * 0.06 + state.rodBend * 0.25,
        aL: -0.9 + Math.sin(now / 120) * 0.25,
        lean: -0.08 - state.rodBend * 0.12,
      });
      break;
    case 'heave':
      // 몸을 뒤로 젖히며 낚싯대를 하늘로 치켜든다
      Object.assign(t, { aR: -2.4, aL: -2.2, lean: -0.28, bodyY: -0.06 });
      break;
    case 'carry':
      if (style === 'one') Object.assign(t, { aR: -0.75 });
      else if (style === 'two') Object.assign(t, { aR: -1.2, aL: -1.2, sL: 0.18, sR: -0.18 });
      else Object.assign(t, { aR: -2.85, aL: -2.85, sL: -0.22, sR: 0.22 });
      break;
    case 'brag': {
      const pump = Math.sin(pt * 9) * 0.15;
      Object.assign(t, { aR: -2.9 + pump, aL: -2.9 + pump, sL: -0.3, sR: 0.3, bodyY: Math.abs(Math.sin(pt * 9)) * 0.08, lean: -0.08 });
      break;
    }
    case 'throwCharge':
      Object.assign(t, { aR: 2.5, aL: -0.9, lean: -0.14 });
      break;
    case 'throw':
      Object.assign(t, { aR: pt < 0.12 ? 2.5 - (pt / 0.12) * 3.9 : -1.4, aL: -0.4, lean: 0.15 });
      break;
  }
  return t;
}

export function Avatar({ state, heldSpeciesId, color, name, rodTip }: Props) {
  const body = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const rod = useRef<Group>(null);
  const segs = useRef<(Group | null)[]>([]);
  const heldRef = useRef<Group>(null);
  const tagRef = useRef<Group>(null);
  const walkPhase = useRef(0);
  const flop = useMemo<FlopControl>(() => ({ amp: 0.05, freq: 7 }), []);
  const heldSpecies = heldSpeciesId ? getSpecies(heldSpeciesId) : undefined;

  useFrame((_, dt) => {
    const b = body.current, lL = legL.current, lR = legR.current, aL = armL.current, aR = armR.current;
    if (!b || !lL || !lR || !aL || !aR || !rod.current) return;
    const now = performance.now();
    const sitting = !!state.seat;
    walkPhase.current += dt * (6 + state.speed * 1.6);
    const swing = !sitting && state.speed > 0 ? Math.sin(walkPhase.current) * Math.min(1, state.speed / 4) * 0.7 : 0;

    const arms = armsFor(state, swing, now);
    if (sitting && state.pose === 'idle') Object.assign(arms, { aL: -0.35, aR: -0.35 });
    const legTarget = sitting ? -Math.PI / 2 : swing;
    const bodyY = sitting ? -0.2 : arms.bodyY;

    const fast = state.pose === 'cast' || state.pose === 'throw' ? 40 : 14;
    lL.rotation.x = damp(lL.rotation.x, legTarget, 14, dt);
    lR.rotation.x = damp(lR.rotation.x, sitting ? -Math.PI / 2 : -swing, 14, dt);
    aL.rotation.x = damp(aL.rotation.x, arms.aL, fast, dt);
    aR.rotation.x = damp(aR.rotation.x, arms.aR, fast, dt);
    aL.rotation.z = damp(aL.rotation.z, arms.sL, 12, dt);
    aR.rotation.z = damp(aR.rotation.z, arms.sR, 12, dt);
    b.position.y = damp(b.position.y, bodyY, 10, dt);
    b.rotation.x = damp(b.rotation.x, arms.lean, 8, dt);

    rod.current.visible = state.hasRod;
    segs.current.forEach((s, i) => {
      if (s) s.rotation.x = damp(s.rotation.x, state.rodBend * BEND_WEIGHT[i]!, 18, dt);
    });

    // 손에 든 물고기: 팔 각도로 손 위치를 계산해 따라간다
    const h = heldRef.current;
    if (h) {
      const held = state.held;
      h.visible = !!held;
      if (!held && tagRef.current) tagRef.current.position.y = 0;
      if (held) {
        const len = fishDisplayLength(held.sizeCm);
        const style = state.pose === 'throwCharge' ? 'one' : carryStyle(held.tier);
        if (style === 'one') {
          const a = aR.rotation.x;
          h.position.set(SHOULDER_X, SHOULDER_Y - ARM_LEN * Math.cos(a) - len * 0.45, -ARM_LEN * Math.sin(a));
          h.rotation.set(-Math.PI / 2, 0, 0);
        } else {
          const a = (aL.rotation.x + aR.rotation.x) / 2;
          const y = SHOULDER_Y - ARM_LEN * Math.cos(a);
          h.position.set(0, y + (style === 'overhead' ? 0.42 : 0), -ARM_LEN * Math.sin(a) + 0.08);
          h.rotation.set(0, Math.PI / 2, 0);
        }
        h.scale.setScalar(len);
        flop.amp = state.pose === 'brag' ? 0.12 : 0.05;
        if (tagRef.current) tagRef.current.position.y = style === 'overhead' ? 0.75 : 0;
        flop.freq = state.pose === 'brag' ? 14 : 7;
      }
    }
  });

  return (
    <group>
      <group ref={body}>
        <group ref={legL} position={[-0.13, 0.62, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <boxGeometry args={[0.18, 0.62, 0.2]} />
            <meshStandardMaterial color={PANTS} flatShading />
          </mesh>
        </group>
        <group ref={legR} position={[0.13, 0.62, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <boxGeometry args={[0.18, 0.62, 0.2]} />
            <meshStandardMaterial color={PANTS} flatShading />
          </mesh>
        </group>
        <mesh position={[0, 0.93, 0]} castShadow>
          <cylinderGeometry args={[0.25, 0.31, 0.64, 6]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
        <group ref={armL} position={[-SHOULDER_X, SHOULDER_Y, 0]}>
          <mesh position={[0, -0.24, 0]} castShadow>
            <boxGeometry args={[0.13, 0.5, 0.13]} />
            <meshStandardMaterial color={color} flatShading />
          </mesh>
        </group>
        <group ref={armR} position={[SHOULDER_X, SHOULDER_Y, 0]}>
          <mesh position={[0, -0.24, 0]} castShadow>
            <boxGeometry args={[0.13, 0.5, 0.13]} />
            <meshStandardMaterial color={color} flatShading />
          </mesh>
          {/* 팔이 앞으로 -0.9 rad 일 때 낚싯대가 앞쪽 위 35도를 향하도록 */}
          <group ref={rod} position={[0, -0.48, 0.04]} rotation-x={1.865}>
            <mesh position={[0, 0.25, 0.05]}>
              <cylinderGeometry args={[0.06, 0.06, 0.06, 8]} />
              <meshStandardMaterial color="#c9c4bb" flatShading />
            </mesh>
            <RodSegment index={0} segs={segs} tip={rodTip} />
          </group>
        </group>
        <mesh position={[0, 1.5, 0]} castShadow>
          <icosahedronGeometry args={[0.26, 0]} />
          <meshStandardMaterial color={SKIN} flatShading />
        </mesh>
        {[-0.09, 0.09].map((x) => (
          <mesh key={x} position={[x, 1.53, 0.23]}>
            <boxGeometry args={[0.04, 0.06, 0.02]} />
            <meshStandardMaterial color="#2b2522" />
          </mesh>
        ))}
        <mesh position={[0, 1.7, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.27, 0.16, 7]} />
          <meshStandardMaterial color={HAT} flatShading />
        </mesh>
        <mesh position={[0, 1.63, 0]}>
          <cylinderGeometry args={[0.4, 0.4, 0.03, 9]} />
          <meshStandardMaterial color={HAT} flatShading />
        </mesh>
        <group ref={heldRef} visible={false}>
          {heldSpecies && <FishMesh species={heldSpecies} flop={flop} />}
        </group>
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
  const r0 = 0.035 - index * 0.006;
  const r1 = r0 - 0.006;
  const last = index === ROD_SEGS.length - 1;
  return (
    <group
      ref={(g) => {
        segs.current[index] = g;
      }}
      position={[0, index === 0 ? 0 : ROD_SEGS[index - 1]!, 0]}
    >
      <mesh position={[0, len / 2, 0]} castShadow>
        <cylinderGeometry args={[Math.max(0.01, r1), r0, len, 5]} />
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
    <sprite position={[0, 2.15, 0]} scale={[1.6, 0.4, 1]}>
      <spriteMaterial map={texture} depthWrite={false} transparent />
    </sprite>
  );
}
