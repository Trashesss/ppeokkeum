import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BufferGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Euler, IcosahedronGeometry,
  InstancedMesh, Matrix4, MeshStandardMaterial, OctahedronGeometry, Quaternion, Vector3, type Mesh, type PointLight,
} from 'three';
import { PROPS, type Prop } from '@fishing/shared';
import { clock } from '../game/clock';
import { createSkyState, sampleSky } from '../game/sky';

interface Part {
  geometry: BufferGeometry;
  color: string | ((p: Prop) => string);
  offset: [number, number, number];
  scale?: [number, number, number];
  rotation?: [number, number, number];
  shadow?: boolean;
}

const TREE_GREENS = ['#7cbf5e', '#93c96a', '#6aab55'];
const FLOWER_COLORS = ['#f4a3b5', '#ffe07a', '#ffffff', '#b9a4f0'];

const PARTS: Partial<Record<Prop['kind'], Part[]>> = {
  tree: [
    { geometry: new CylinderGeometry(0.14, 0.2, 1.4, 6), color: '#8a6243', offset: [0, 0.7, 0] },
    { geometry: new IcosahedronGeometry(1, 0), color: (p) => TREE_GREENS[p.variant] ?? '#7cbf5e', offset: [0, 1.9, 0], scale: [1.05, 0.95, 1.05] },
    { geometry: new IcosahedronGeometry(0.7, 0), color: (p) => TREE_GREENS[(p.variant + 1) % 3]!, offset: [0.35, 2.55, 0.1] },
  ],
  pine: [
    { geometry: new CylinderGeometry(0.12, 0.16, 1, 5), color: '#7a5639', offset: [0, 0.5, 0] },
    { geometry: new ConeGeometry(1.1, 1.5, 6), color: '#4f9a63', offset: [0, 1.5, 0] },
    { geometry: new ConeGeometry(0.85, 1.3, 6), color: '#5aa86c', offset: [0, 2.25, 0] },
    { geometry: new ConeGeometry(0.55, 1.1, 6), color: '#66b376', offset: [0, 2.95, 0] },
  ],
  rock: [{ geometry: new DodecahedronGeometry(0.7, 0), color: (p) => (p.variant ? '#a6a198' : '#b8b3a8'), offset: [0, 0.2, 0], scale: [1, 0.65, 0.9] }],
  bush: [
    { geometry: new IcosahedronGeometry(0.5, 0), color: '#6fae58', offset: [0, 0.3, 0] },
    { geometry: new IcosahedronGeometry(0.38, 0), color: '#82bd62', offset: [0.4, 0.22, 0.1] },
  ],
  flower: [
    { geometry: new CylinderGeometry(0.02, 0.02, 0.3, 3), color: '#5e9a4a', offset: [0, 0.15, 0], shadow: false },
    { geometry: new OctahedronGeometry(0.09, 0), color: (p) => FLOWER_COLORS[p.variant] ?? '#fff', offset: [0, 0.32, 0], shadow: false },
  ],
};

const tmp = { m: new Matrix4(), part: new Matrix4(), q: new Quaternion(), e: new Euler(), s: new Vector3(), v: new Vector3(), c: new Color() };

function InstancedPart({ props, part }: { props: Prop[]; part: Part }) {
  const ref = useRef<InstancedMesh>(null);
  const material = useMemo(() => new MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.9 }), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    props.forEach((p, i) => {
      tmp.m.compose(tmp.v.set(p.x, p.y, p.z), tmp.q.setFromEuler(tmp.e.set(0, p.yaw, 0)), tmp.s.setScalar(p.scale));
      const r = part.rotation ?? [0, 0, 0];
      tmp.part.compose(
        tmp.v.set(...part.offset),
        tmp.q.setFromEuler(tmp.e.set(r[0], r[1], r[2])),
        tmp.s.set(...(part.scale ?? [1, 1, 1])),
      );
      mesh.setMatrixAt(i, tmp.m.multiply(tmp.part));
      mesh.setColorAt(i, tmp.c.set(typeof part.color === 'function' ? part.color(p) : part.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [props, part]);
  const shadow = part.shadow ?? true;
  return <instancedMesh ref={ref} args={[part.geometry, material, props.length]} castShadow={shadow} receiveShadow />;
}

function Bench({ p }: { p: Prop }) {
  return (
    <group position={[p.x, p.y, p.z]} rotation-y={p.yaw}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.1, 0.5]} />
        <meshStandardMaterial color="#b0855b" flatShading />
      </mesh>
      <mesh position={[0, 0.8, -0.24]} rotation-x={-0.15} castShadow>
        <boxGeometry args={[1.6, 0.45, 0.08]} />
        <meshStandardMaterial color="#a77b52" flatShading />
      </mesh>
      {[-0.65, 0.65].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]} castShadow>
          <boxGeometry args={[0.1, 0.45, 0.45]} />
          <meshStandardMaterial color="#7d5a3c" flatShading />
        </mesh>
      ))}
    </group>
  );
}

const sky = createSkyState();

function Lantern({ p }: { p: Prop }) {
  const glow = useRef<Mesh>(null);
  useFrame(() => {
    const m = glow.current?.material as MeshStandardMaterial | undefined;
    if (m) m.emissiveIntensity = 0.15 + sampleSky(clock.tod(), sky).night * 0.9;
  });
  return (
    <group position={[p.x, p.y, p.z]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 1.8, 5]} />
        <meshStandardMaterial color="#5b4a3d" flatShading />
      </mesh>
      <mesh ref={glow} position={[0, 1.95, 0]}>
        <boxGeometry args={[0.28, 0.32, 0.28]} />
        <meshStandardMaterial color="#f7d38a" emissive="#ffa83d" emissiveIntensity={1} flatShading />
      </mesh>
      <mesh position={[0, 2.16, 0]}>
        <coneGeometry args={[0.24, 0.16, 4]} />
        <meshStandardMaterial color="#5b4a3d" flatShading />
      </mesh>
    </group>
  );
}

function Campfire({ p }: { p: Prop }) {
  const light = useRef<PointLight>(null);
  const flame = useRef<Mesh>(null);
  useFrame(({ clock: c }) => {
    const t = c.elapsedTime;
    const night = sampleSky(clock.tod(), sky).night;
    const flicker = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
    if (light.current) light.current.intensity = (4 + night * 18) * flicker;
    if (flame.current) {
      flame.current.scale.set(1, flicker * 1.1, 1);
      flame.current.rotation.y = t * 0.8;
    }
  });
  return (
    <group position={[p.x, p.y, p.z]}>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7]} rotation-y={a}>
            <dodecahedronGeometry args={[0.18, 0]} />
            <meshStandardMaterial color="#9a958c" flatShading />
          </mesh>
        );
      })}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.15, 0]} rotation={[Math.PI / 2, 0, (i / 3) * Math.PI]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 1, 5]} />
          <meshStandardMaterial color="#6e4d33" flatShading />
        </mesh>
      ))}
      <mesh ref={flame} position={[0, 0.55, 0]}>
        <coneGeometry args={[0.32, 0.8, 5]} />
        <meshStandardMaterial color="#ffb347" emissive="#ff8a2a" emissiveIntensity={2.2} flatShading />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <coneGeometry args={[0.18, 0.5, 5]} />
        <meshStandardMaterial color="#fff0a0" emissive="#ffd36a" emissiveIntensity={2.5} flatShading />
      </mesh>
      <pointLight ref={light} position={[0, 1.2, 0]} color="#ffae5c" distance={14} decay={1.6} />
    </group>
  );
}

export function Props() {
  const byKind = useMemo(() => {
    const map = new Map<Prop['kind'], Prop[]>();
    for (const p of PROPS) map.set(p.kind, [...(map.get(p.kind) ?? []), p]);
    return map;
  }, []);
  return (
    <group>
      {[...byKind.entries()].flatMap(([kind, list]) =>
        (PARTS[kind] ?? []).map((part, i) => <InstancedPart key={`${kind}-${i}`} props={list} part={part} />),
      )}
      {(byKind.get('bench') ?? []).map((p, i) => <Bench key={i} p={p} />)}
      {(byKind.get('lantern') ?? []).map((p, i) => <Lantern key={i} p={p} />)}
      {(byKind.get('campfire') ?? []).map((p, i) => <Campfire key={i} p={p} />)}
    </group>
  );
}
