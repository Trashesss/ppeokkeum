import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Fog, PointsMaterial, Vector3,
  type DirectionalLight, type HemisphereLight, type Points,
} from 'three';
import { CAMPFIRE, LAKE, createRng, groundHeight } from '@fishing/shared';
import { clock } from '../game/clock';
import { player } from '../game/player';
import { createSkyState, sampleSky } from '../game/sky';
import { patchGame } from '../game/store';

const sky = createSkyState();
const sunDir = new Vector3();

function Stars() {
  const geo = useMemo(() => {
    const rng = createRng(11);
    const n = 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rng() * Math.PI * 2;
      const v = Math.acos(rng() * 0.95);
      pos.set([Math.sin(v) * Math.cos(u) * 180, Math.cos(v) * 180, Math.sin(v) * Math.sin(u) * 180], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    return g;
  }, []);
  const mat = useMemo(() => new PointsMaterial({ color: '#ffffff', size: 1.1, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }), []);
  const ref = useRef<Points>(null);
  useFrame(() => {
    mat.opacity = Math.max(0, sky.night - 0.3) / 0.7;
    ref.current?.position.set(player.pos.x, 0, player.pos.z);
  });
  return <points ref={ref} geometry={geo} material={mat} />;
}

function Fireflies() {
  const n = 70;
  const base = useMemo(() => {
    const rng = createRng(77);
    return Array.from({ length: n }, (_, i) => {
      const around = i % 2 ? { x: LAKE.x, z: LAKE.z, r: LAKE.r + 4 } : { x: CAMPFIRE.x, z: CAMPFIRE.z, r: 9 };
      const a = rng() * Math.PI * 2;
      const r = around.r * (0.6 + rng() * 0.6);
      const x = around.x + Math.cos(a) * r;
      const z = around.z + Math.sin(a) * r;
      return { x, z, y: Math.max(0.2, groundHeight(x, z)) + 0.6 + rng() * 1.4, phase: rng() * 10 };
    });
  }, []);
  const geo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    return g;
  }, []);
  const mat = useMemo(() => new PointsMaterial({ color: '#fff3a0', size: 0.16, transparent: true, blending: AdditiveBlending, depthWrite: false }), []);
  useFrame(({ clock: c }) => {
    const t = c.elapsedTime;
    const pos = geo.attributes.position as BufferAttribute;
    base.forEach((b, i) => {
      pos.setXYZ(i, b.x + Math.sin(t * 0.4 + b.phase) * 0.8, b.y + Math.sin(t * 0.9 + b.phase * 2) * 0.3, b.z + Math.cos(t * 0.35 + b.phase) * 0.8);
    });
    pos.needsUpdate = true;
    mat.opacity = Math.max(0, sky.night - 0.2) * (0.75 + Math.sin(t * 3) * 0.25);
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

export function Environment() {
  const { scene } = useThree();
  const sun = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const lastPublish = useRef(0);

  useEffect(() => {
    scene.background = new Color();
    scene.fog = new Fog('#a8d8ef', 45, 150);
    if (sun.current) scene.add(sun.current.target);
  }, [scene]);

  useFrame(({ clock: c }) => {
    const t = clock.tod();
    sampleSky(t, sky);
    (scene.background as Color).copy(sky.sky);
    (scene.fog as Fog).color.copy(sky.sky);

    // 해: 오전 6시 동쪽(+x)에서 떠서 정오에 머리 위, 오후 6시 서쪽. 밤에는 반대편 달빛.
    const a = (t - 0.25) * Math.PI * 2;
    sunDir.set(Math.cos(a), Math.sin(a), 0.35);
    if (sunDir.y < 0.15) sunDir.set(-Math.cos(a), Math.max(0.4, -Math.sin(a)), 0.35);
    sunDir.normalize();
    const l = sun.current;
    if (l) {
      l.color.copy(sky.sun);
      l.intensity = sky.sunI;
      l.position.copy(player.pos).addScaledVector(sunDir, 40);
      l.target.position.copy(player.pos);
    }
    if (hemi.current) {
      hemi.current.color.copy(sky.hemiSky);
      hemi.current.groundColor.copy(sky.hemiGround);
      hemi.current.intensity = sky.hemiI;
    }
    if (c.elapsedTime - lastPublish.current > 0.5) {
      lastPublish.current = c.elapsedTime;
      patchGame({ tod: Math.round(t * 1440) / 1440 });
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
      />
      <Stars />
      <Fireflies />
    </>
  );
}
