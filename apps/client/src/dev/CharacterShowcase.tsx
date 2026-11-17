import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import { AnimationMixer, AxesHelper, Box3, LoopRepeat, Vector3, type Object3D } from 'three';
import { CHARACTERS, useCharacterModel, useClips, type CharacterId } from '../scene/character/assets';

/**
 * 개발용: 캐릭터·클립 확인 화면.
 * ?showcase=character&clip=Fishing_Cast&t=0.4 (t: 0~1 정규화 시각, 없으면 재생)&axes
 */
const params = new URLSearchParams(location.search);
const clipName = params.get('clip') ?? 'Idle_A';
const fixedT = params.get('t');
const axes = params.has('axes');
const yaw = Number(params.get('yaw') ?? 0.6);
/** 같은 캐릭터를 여러 시점으로 나열: &ts=0.1,0.3,0.5 */
const times = params.get('ts')?.split(',').map(Number);

function Char({ id, x, t }: { id: CharacterId; x: number; t?: number }) {
  const model = useCharacterModel(id);
  const clips = useClips();
  const mixer = useMemo(() => new AnimationMixer(model), [model]);
  useEffect(() => {
    const clip = clips.get(clipName);
    if (!clip) return;
    const a = mixer.clipAction(clip);
    a.setLoop(LoopRepeat, Infinity).play();
    const tt = t ?? (fixedT !== null ? Number(fixedT) : null);
    if (tt !== null) {
      a.paused = true;
      a.time = tt * clip.duration;
    }
    mixer.update(0);
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    model.updateWorldMatrix(true, true);
    const hips = model.getObjectByName('hips')?.getWorldPosition(new Vector3()).sub(model.getWorldPosition(new Vector3()));
    (window as unknown as Record<string, unknown>)[`__char_${id}`] = {
      height: +size.y.toFixed(3),
      min: box.min.toArray().map((v) => +v.toFixed(2)),
      duration: clip.duration,
      hips: hips?.toArray().map((v) => +v.toFixed(3)),
    };
    if (axes) {
      const slot = model.getObjectByName('handslotr');
      if (slot) slot.add(new AxesHelper(0.6));
    }
  }, [clips, mixer, model, id, t]);
  useFrame((_, dt) => mixer.update(dt));
  return <primitive object={model as Object3D} position={[x, 0, 0]} rotation-y={yaw} />;
}

export function CharacterShowcase() {
  const ids = (params.get('chars')?.split(',') as CharacterId[] | undefined) ?? [...CHARACTERS];
  const gap = 1.6;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#cfe6ee' }}>
      <Canvas shadows camera={{ position: [0, 1.6, 6.5], fov: 45 }} onCreated={({ camera }) => camera.lookAt(0, 0.9, 0)}>
        <hemisphereLight args={['#eaf6ff', '#8a7a62', 1.3]} />
        <directionalLight position={[3, 5, 4]} intensity={2.2} castShadow />
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[30, 30]} />
          <meshStandardMaterial color="#e9dfcc" />
        </mesh>
        <Suspense fallback={null}>
          {times
            ? times.map((t, i) => <Char key={i} id={ids[0]!} t={t} x={(i - (times.length - 1) / 2) * gap} />)
            : ids.map((id, i) => <Char key={id} id={id} x={(i - (ids.length - 1) / 2) * gap} />)}
        </Suspense>
      </Canvas>
      <div style={{ position: 'fixed', top: 12, left: 12, font: '700 16px system-ui', color: '#4a3f35' }}>
        {clipName} {times ? `@ ${times.join(' / ')}` : fixedT !== null ? `@ ${fixedT}` : ''}
      </div>
    </div>
  );
}
