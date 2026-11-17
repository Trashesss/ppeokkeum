import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { FISH_SPECIES, getSpecies } from '@fishing/shared';
import { FishMesh } from '../scene/fish/FishMesh';

/**
 * 개발용: 물고기 모델 비교 화면.
 * ?showcase=fish&ids=crucian,catfish,mackerel&yaw=0.6&flop=0
 */
const params = new URLSearchParams(location.search);
const ids = (params.get('ids') ?? 'crucian,catfish,mackerel').split(',');
const yaw = Number(params.get('yaw') ?? 0.5);
const flopAmp = Number(params.get('flop') ?? 0);
const spin = params.has('spin');

function Turntable({ id, x }: { id: string; x: number }) {
  const ref = useRef<Group>(null);
  const species = getSpecies(id) ?? FISH_SPECIES[0]!;
  useFrame((_, dt) => {
    if (spin && ref.current) ref.current.rotation.y += dt * 0.6;
  });
  return (
    <group position={[x, 0, 0]}>
      <group ref={ref} rotation-y={Math.PI / 2 + yaw} scale={1.6}>
        <FishMesh species={species} flop={{ amp: flopAmp, freq: 8 }} />
      </group>
      <mesh position={[0, -0.55, 0]} receiveShadow>
        <cylinderGeometry args={[0.9, 0.95, 0.12, 8]} />
        <meshStandardMaterial color="#e9dfcc" flatShading />
      </mesh>
    </group>
  );
}

export function FishShowcase() {
  const gap = 2.1;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#cfe6ee' }}>
      <Canvas shadows camera={{ position: [0, 1.1, 4.6], fov: 45 }} onCreated={({ camera }) => camera.lookAt(0, -0.1, 0)}>
        <hemisphereLight args={['#eaf6ff', '#8a7a62', 1.2]} />
        <directionalLight position={[3, 5, 4]} intensity={2.2} castShadow />
        {ids.map((id, i) => (
          <Turntable key={id} id={id} x={(i - (ids.length - 1) / 2) * gap} />
        ))}
      </Canvas>
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 56, display: 'flex', justifyContent: 'center', gap: `${gap * 7.2}vw`, font: '700 20px system-ui', color: '#4a3f35' }}>
        {ids.map((id) => (
          <span key={id}>{getSpecies(id)?.name ?? id}</span>
        ))}
      </div>
    </div>
  );
}
