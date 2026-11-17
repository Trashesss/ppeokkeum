import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CanvasTexture, SRGBColorSpace, type Group } from 'three';
import { FISH_SPECIES, getSpecies } from '@fishing/shared';
import { FishMesh } from '../scene/fish/FishMesh';

/**
 * 개발용: 물고기 모델 비교 화면.
 * ?showcase=fish&ids=crucian,catfish,mackerel&yaw=0.6&flop=0
 */
const params = new URLSearchParams(location.search);
const ids = (params.get('ids') ?? (params.has('all') ? FISH_SPECIES.map((f) => f.id).join(',') : 'crucian,catfish,mackerel')).split(',');
const COLS = Math.min(4, ids.length);
const yaw = Number(params.get('yaw') ?? 0.5);
const flopAmp = Number(params.get('flop') ?? 0);
const spin = params.has('spin');

function Label({ text }: { text: string }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.font = '700 34px system-ui, "Apple SD Gothic Neo", sans-serif';
    g.fillStyle = '#4a3f35';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 32);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [text]);
  return (
    <sprite position={[0, -0.85, 0.6]} scale={[1.4, 0.35, 1]}>
      <spriteMaterial map={tex} />
    </sprite>
  );
}

function Turntable({ id, x, y }: { id: string; x: number; y: number }) {
  const ref = useRef<Group>(null);
  const species = getSpecies(id) ?? FISH_SPECIES[0]!;
  useFrame((_, dt) => {
    if (spin && ref.current) ref.current.rotation.y += dt * 0.6;
  });
  return (
    <group position={[x, y, 0]}>
      <group ref={ref} rotation-y={Math.PI / 2 + yaw} scale={1.6}>
        <FishMesh species={species} flop={{ amp: flopAmp, freq: 8 }} />
      </group>
      <mesh position={[0, -0.55, 0]} receiveShadow>
        <cylinderGeometry args={[0.9, 0.95, 0.12, 8]} />
        <meshStandardMaterial color="#e9dfcc" flatShading />
      </mesh>
      <Label text={species.name} />
    </group>
  );
}

export function FishShowcase() {
  const gap = 2.1;
  const rows = Math.ceil(ids.length / COLS);
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#cfe6ee' }}>
      <Canvas shadows camera={{ position: [0, 1.1 - rows * 0.95, 4.6 + rows * 1.9], fov: 45 }} onCreated={({ camera }) => camera.lookAt(0, -0.1 - (rows - 1) * 0.95, 0)}>
        <hemisphereLight args={['#eaf6ff', '#8a7a62', 1.2]} />
        <directionalLight position={[3, 5, 4]} intensity={2.2} castShadow />
        {ids.map((id, i) => (
          <Turntable key={id} id={id} x={((i % COLS) - (COLS - 1) / 2) * gap} y={-Math.floor(i / COLS) * 1.9} />
        ))}
      </Canvas>
    </div>
  );
}
