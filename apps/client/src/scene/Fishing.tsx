import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial, MeshBasicMaterial, Vector3, type Group, type Mesh } from 'three';
import { getSpecies } from '@fishing/shared';
import { fishing, stepFishing } from '../game/fishing';
import { fishDisplayLength } from '../game/fx';
import { player } from '../game/player';
import { useGame } from '../game/store';
import { FishMesh, type FlopControl } from './fish/FishMesh';

const LINE_POINTS = 16;
const RIPPLES = 8;

interface Ripple {
  mesh: Mesh | null;
  age: number;
  strength: number;
}

const tip = new Vector3();
const mid = new Vector3();
const end = new Vector3();

export function Fishing() {
  const bobber = useRef<Group>(null);
  const flyer = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const ripples = useRef<Ripple[]>(Array.from({ length: RIPPLES }, () => ({ mesh: null, age: 99, strength: 1 })));
  const nextRipple = useRef(0);
  const flying = useGame((s) => s.flying);
  const flyingSpecies = flying ? getSpecies(flying.speciesId) : undefined;
  const flyFlop = useMemo<FlopControl>(() => ({ amp: 0.22, freq: 15 }), []);

  const line = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(LINE_POINTS * 3), 3));
    const l = new Line(g, new LineBasicMaterial({ color: '#f5f1e6', transparent: true, opacity: 0.85 }));
    l.frustumCulled = false;
    return l;
  }, []);

  useEffect(() => {
    fishing.onRipple = (x, z, strength) => {
      const r = ripples.current[nextRipple.current++ % RIPPLES]!;
      r.age = 0;
      r.strength = strength;
      r.mesh?.position.set(x, 0.06, z);
    };
  }, []);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    stepFishing(dt);
    const t = clock.elapsedTime;
    const f = fishing;

    // 찌
    const b = bobber.current;
    if (b) {
      b.visible = f.bobberVisible;
      if (f.phase === 'casting') b.position.copy(f.bobber);
      else b.position.set(f.bobber.x, 0.05 + Math.sin(t * 2.2) * 0.035 - f.dip, f.bobber.z);
    }

    // 날아가는 물고기 (낚아올릴 때 / 던질 때)
    const fl = flyer.current;
    if (fl) {
      fl.visible = !!f.flight;
      if (f.flight && flying) {
        fl.position.copy(f.flightPos);
        fl.rotation.copy(f.flightRot);
        fl.scale.setScalar(fishDisplayLength(flying.sizeCm));
      }
    }

    // 끌어올리는 동안 물속에 비치는 물고기 그림자. 크기로 대물을 미리 짐작할 수 있다.
    const sh = shadow.current;
    if (sh) {
      const species = f.roll && getSpecies(f.roll.speciesId);
      const show = f.phase === 'reeling' && !!species && !!f.reel;
      sh.visible = show;
      if (show && f.roll && f.reel) {
        const len = fishDisplayLength(f.roll.sizeCm) * 1.1;
        const away = Math.atan2(f.bobber.x - player.pos.x, f.bobber.z - player.pos.z);
        sh.position.set(f.bobber.x + Math.sin(away) * len * 0.45, -0.25, f.bobber.z + Math.cos(away) * len * 0.45);
        sh.rotation.set(-Math.PI / 2, 0, -away + Math.sin(t * 6) * 0.25);
        sh.scale.set(len * 0.32, len, 1);
        (sh.material as MeshBasicMaterial).opacity = 0.18 + f.reel.progress * 0.35;
      }
    }

    // 낚싯줄: 대기 중엔 느슨하게, 당길 땐 팽팽하게
    player.rodTip.updateWorldMatrix(true, false);
    player.rodTip.getWorldPosition(tip);
    const toFlyer = f.phase === 'landing' && f.flight && f.flight.u < 0.85;
    const showLine = player.hasRod && (f.bobberVisible || !!toFlyer);
    line.visible = showLine;
    if (showLine) {
      if (toFlyer) end.copy(f.flightPos);
      else if (b) end.copy(b.position);
      const sag = f.phase === 'waiting' || f.phase === 'bite' ? 0.9 : f.phase === 'casting' ? 0.2 : 0.03;
      mid.lerpVectors(tip, end, 0.5);
      mid.y -= sag;
      const pos = line.geometry.attributes.position as BufferAttribute;
      for (let i = 0; i < LINE_POINTS; i++) {
        const k = i / (LINE_POINTS - 1);
        const a = (1 - k) * (1 - k);
        const c = 2 * (1 - k) * k;
        const d = k * k;
        pos.setXYZ(i, tip.x * a + mid.x * c + end.x * d, tip.y * a + mid.y * c + end.y * d, tip.z * a + mid.z * c + end.z * d);
      }
      pos.needsUpdate = true;
    }

    // 물결
    for (const r of ripples.current) {
      if (!r.mesh) continue;
      r.age += dt;
      const life = Math.min(1, r.age / 1.2);
      r.mesh.visible = life < 1;
      const s = (0.25 + life * 1.4) * r.strength;
      r.mesh.scale.set(s, s, s);
      (r.mesh.material as MeshBasicMaterial).opacity = (1 - life) * 0.7;
    }
  });

  return (
    <group>
      <primitive object={line} />
      <group ref={bobber} visible={false}>
        <mesh position={[0, 0.06, 0]}>
          <sphereGeometry args={[0.09, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#e5484d" flatShading />
        </mesh>
        <mesh position={[0, 0.06, 0]} rotation-x={Math.PI}>
          <sphereGeometry args={[0.09, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#f6f2ea" flatShading />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.18, 4]} />
          <meshStandardMaterial color="#e5484d" />
        </mesh>
      </group>
      <group ref={flyer} visible={false}>
        {flyingSpecies && <FishMesh species={flyingSpecies} flop={flyFlop} />}
      </group>
      <mesh ref={shadow} visible={false}>
        <circleGeometry args={[0.5, 7]} />
        <meshBasicMaterial color="#0b2a33" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      {ripples.current.map((r, i) => (
        <mesh
          key={i}
          ref={(m) => {
            r.mesh = m;
          }}
          rotation-x={-Math.PI / 2}
          visible={false}
        >
          <ringGeometry args={[0.42, 0.5, 20]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
