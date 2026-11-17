import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { getSpecies } from '@fishing/shared';
import { catchAudio } from '../game/audio';
import { fishDisplayLength } from '../game/fx';
import { useGame, type GroundFishItem } from '../game/store';
import { FishMesh, type FlopControl } from './fish/FishMesh';
import { shapeFor } from './fish/shapes';

/** 땅에 떨어져 파닥거리는 물고기 */
function FloppingFish({ item }: { item: GroundFishItem }) {
  const ref = useRef<Group>(null);
  const species = getSpecies(item.speciesId);
  const flat = species ? shapeFor(species).kind === 'ray' : false;
  const flop = useMemo<FlopControl>(() => ({ amp: 0.2, freq: 16 }), []);
  const st = useRef({ t: Math.random(), nextHop: 0.3, hopT: -1, yaw: Math.random() * Math.PI * 2 });

  useFrame((_, rawDt) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(rawDt, 0.05);
    const s = st.current;
    s.t += dt;
    if (s.hopT < 0 && s.t > s.nextHop) {
      s.hopT = 0;
      s.yaw += (Math.random() - 0.5) * 1.6;
      if (Math.random() < 0.35) catchAudio.flop();
    }
    let lift = 0;
    if (s.hopT >= 0) {
      s.hopT += dt;
      const k = s.hopT / 0.32;
      lift = Math.sin(Math.min(1, k) * Math.PI) * 0.22;
      if (k >= 1) {
        s.hopT = -1;
        s.t = 0;
        s.nextHop = 0.25 + Math.random() * 0.9;
      }
    }
    // 쉬는 동안은 약하게, 튀어 오를 땐 세게 파닥인다
    flop.amp = s.hopT >= 0 ? 0.28 : 0.1;
    const len = fishDisplayLength(item.sizeCm);
    g.position.set(item.x, item.y + len * 0.08 + lift, item.z);
    // 일반 물고기는 옆으로 누워서, 가오리는 납작하게 엎드려 파닥인다
    const wobble = s.hopT >= 0 ? Math.sin(s.hopT * 30) * 0.4 : 0;
    if (flat) g.rotation.set(wobble * 0.5, s.yaw, 0);
    else g.rotation.set(0, s.yaw, Math.PI / 2 + wobble);
    g.scale.setScalar(len);
  });

  if (!species) return null;
  return (
    <group ref={ref}>
      <FishMesh species={species} flop={flop} />
    </group>
  );
}

export function GroundFish() {
  const list = useGame((s) => s.groundFish);
  return (
    <>
      {list.map((g) => (
        <FloppingFish key={g.id} item={g} />
      ))}
    </>
  );
}
