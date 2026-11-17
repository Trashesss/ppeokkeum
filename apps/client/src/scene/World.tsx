import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { BufferAttribute, Color, MeshStandardMaterial, PlaneGeometry } from 'three';
import { BRIDGE, DOCK, MAP_HALF_SIZE, PLAZA_RADIUS, SPAWN, bridgeHeight, distToPath, fbm, terrainHeight } from '@fishing/shared';

const C = {
  deep: new Color('#9c8a62'),
  wetSand: new Color('#c9b380'),
  sand: new Color('#ecd9a4'),
  path: new Color('#cfae7c'),
  plaza: new Color('#d8ccb4'),
  grassA: new Color('#8fc76c'),
  grassB: new Color('#76b25b'),
  rock: new Color('#a39d93'),
};

function buildTerrain(): PlaneGeometry {
  const size = MAP_HALF_SIZE * 2;
  const geo = new PlaneGeometry(size, size, 120, 120);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  const flat = geo.toNonIndexed() as PlaneGeometry;
  const p = flat.attributes.position as BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const c = new Color();
  for (let f = 0; f < p.count; f += 3) {
    const cx = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3;
    const cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
    const cz = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
    if (cy < -0.6) c.copy(C.deep);
    else if (cy < 0.05) c.copy(C.wetSand);
    else if (cy < 0.45) c.copy(C.sand);
    else if (Math.hypot(cx - SPAWN.x, cz - SPAWN.z) < PLAZA_RADIUS) c.copy(C.plaza);
    else if (distToPath(cx, cz) < 1.25) c.copy(C.path);
    else if (cy > 3.9) c.copy(C.rock);
    else c.copy(C.grassA).lerp(C.grassB, fbm(cx * 0.12, cz * 0.12, 5, 2));
    const jitter = 0.96 + ((f * 2654435761) % 1000) / 1000 * 0.08;
    c.multiplyScalar(jitter);
    for (let k = 0; k < 3; k++) c.toArray(colors, (f + k) * 3);
  }
  flat.setAttribute('color', new BufferAttribute(colors, 3));
  flat.computeVertexNormals();
  return flat;
}

function Terrain() {
  const geo = useMemo(buildTerrain, []);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={0.95} />
    </mesh>
  );
}

function Water() {
  const mat = useMemo(() => {
    const m = new MeshStandardMaterial({ color: '#5cb4cc', transparent: true, opacity: 0.8, flatShading: true, roughness: 0.25, metalness: 0.05 });
    const uniforms = { uTime: { value: 0 } };
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           transformed.z += sin(position.x * 0.32 + uTime * 1.1) * 0.07 + cos(position.y * 0.41 + uTime * 0.85) * 0.07;`,
        );
    };
    m.userData.uniforms = uniforms;
    return m;
  }, []);
  useFrame((_, dt) => {
    (mat.userData.uniforms as { uTime: { value: number } }).uTime.value += dt;
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0} material={mat}>
      <planeGeometry args={[320, 320, 160, 160]} />
    </mesh>
  );
}

function SeaFloor() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-4.05}>
      <planeGeometry args={[600, 600]} />
      <meshStandardMaterial color="#3b7f96" roughness={1} />
    </mesh>
  );
}

const WOOD = '#a77b52';
const WOOD_DARK = '#7d5a3c';

function Dock() {
  const len = DOCK.maxZ - DOCK.minZ;
  const width = DOCK.maxX - DOCK.minX;
  const planks = Math.floor(len / 0.5);
  const posts: [number, number][] = [];
  for (let z = DOCK.minZ + 2; z <= DOCK.maxZ; z += 3) posts.push([DOCK.minX, z], [DOCK.maxX, z]);
  return (
    <group>
      {Array.from({ length: planks }, (_, i) => (
        <mesh key={i} position={[0, DOCK.y - 0.06, DOCK.minZ + 0.25 + i * 0.5]} castShadow receiveShadow>
          <boxGeometry args={[width + (i % 3) * 0.06, 0.12, 0.44]} />
          <meshStandardMaterial color={i % 2 ? WOOD : '#b0855b'} flatShading />
        </mesh>
      ))}
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, DOCK.y - 1.4, z]} castShadow>
          <cylinderGeometry args={[0.12, 0.14, 3, 6]} />
          <meshStandardMaterial color={WOOD_DARK} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Bridge() {
  const mx = (BRIDGE.minX + BRIDGE.maxX) / 2;
  const width = BRIDGE.maxX - BRIDGE.minX;
  const steps = Math.floor((BRIDGE.maxZ - BRIDGE.minZ) / 0.45);
  return (
    <group>
      {Array.from({ length: steps }, (_, i) => {
        const z = BRIDGE.minZ + 0.22 + i * 0.45;
        const y = bridgeHeight(z);
        return (
          <mesh key={i} position={[mx, y - 0.06, z]} castShadow receiveShadow>
            <boxGeometry args={[width, 0.12, 0.4]} />
            <meshStandardMaterial color={i % 2 ? WOOD : '#b0855b'} flatShading />
          </mesh>
        );
      })}
      {[BRIDGE.minX + 0.08, BRIDGE.maxX - 0.08].flatMap((x) =>
        Array.from({ length: 6 }, (_, i) => {
          const z = BRIDGE.minZ + 0.4 + i * ((BRIDGE.maxZ - BRIDGE.minZ - 0.8) / 5);
          return (
            <mesh key={`${x}-${i}`} position={[x, bridgeHeight(z) + 0.4, z]} castShadow>
              <boxGeometry args={[0.1, 0.8, 0.1]} />
              <meshStandardMaterial color={WOOD_DARK} flatShading />
            </mesh>
          );
        }),
      )}
      {[BRIDGE.minX + 0.08, BRIDGE.maxX - 0.08].map((x) => (
        <Rail key={x} x={x} />
      ))}
    </group>
  );
}

function Rail({ x }: { x: number }) {
  const segs = 10;
  return (
    <group>
      {Array.from({ length: segs }, (_, i) => {
        const z0 = BRIDGE.minZ + 0.4 + (i / segs) * (BRIDGE.maxZ - BRIDGE.minZ - 0.8);
        const z1 = BRIDGE.minZ + 0.4 + ((i + 1) / segs) * (BRIDGE.maxZ - BRIDGE.minZ - 0.8);
        const y0 = bridgeHeight(z0) + 0.8;
        const y1 = bridgeHeight(z1) + 0.8;
        const len = Math.hypot(z1 - z0, y1 - y0);
        return (
          <mesh key={i} position={[x, (y0 + y1) / 2, (z0 + z1) / 2]} rotation-x={-Math.atan2(y1 - y0, z1 - z0)}>
            <boxGeometry args={[0.12, 0.08, len + 0.02]} />
            <meshStandardMaterial color={WOOD} flatShading />
          </mesh>
        );
      })}
    </group>
  );
}

function PlazaStones() {
  const n = 14;
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const x = SPAWN.x + Math.cos(a) * (PLAZA_RADIUS + 0.2);
        const z = SPAWN.z + Math.sin(a) * (PLAZA_RADIUS + 0.2);
        return (
          <mesh key={i} position={[x, terrainHeight(x, z) + 0.05, z]} rotation-y={a} receiveShadow>
            <boxGeometry args={[0.9, 0.14, 0.5]} />
            <meshStandardMaterial color="#bfb39b" flatShading />
          </mesh>
        );
      })}
    </group>
  );
}

export function World() {
  return (
    <group>
      <Terrain />
      <SeaFloor />
      <Water />
      <Dock />
      <Bridge />
      <PlazaStones />
    </group>
  );
}
