import type { WaterType } from './fish.ts';
import { fbm, smoothstep } from './noise.ts';
import { createRng, randRange } from './rng.ts';

/**
 * 섬 맵. 지형·물·이동 판정은 모두 이 함수들로만 계산한다.
 * 서버(1단계)가 같은 함수로 "물가에서 던졌는지(D1)"를 검증하기 때문에
 * 클라이언트가 따로 판정 규칙을 만들지 않는다.
 */

export interface Vec2 {
  x: number;
  z: number;
}
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const WATER_LEVEL = 0;
export const ISLAND_RADIUS = 44;
export const MAP_HALF_SIZE = 66;

export const SPAWN: Vec2 = { x: 0, z: 12 };
export const PLAZA_RADIUS = 5;
export const CAMPFIRE: Vec2 = { x: 6.5, z: 15.5 };
export const LAKE = { x: -15, z: -6, r: 8 };
export const RIVER = { from: { x: -8, z: -6 }, to: { x: 72, z: -6 }, halfWidth: 2.6 };

export const PATHS: readonly (readonly Vec2[])[] = [
  [SPAWN, { x: 0.5, z: 24 }, { x: 0, z: 40 }],
  [SPAWN, { x: -6, z: 7 }, { x: -12, z: 4.5 }],
  [SPAWN, { x: 8, z: 6 }, { x: 17.3, z: -0.5 }],
  [{ x: 17.3, z: -11.5 }, { x: 15, z: -20 }, { x: 8, z: -28 }],
];

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}

export function distToPath(x: number, z: number): number {
  let best = Infinity;
  const p = { x, z };
  for (const path of PATHS) {
    for (let i = 0; i < path.length - 1; i++) best = Math.min(best, distToSegment(p, path[i]!, path[i + 1]!));
  }
  return best;
}

export function distToRiver(x: number, z: number): number {
  return distToSegment({ x, z }, RIVER.from, RIVER.to);
}

/** 각도별 해안선 반지름 */
export function coastRadius(angle: number): number {
  return ISLAND_RADIUS + (fbm(Math.cos(angle) * 1.5 + 5, Math.sin(angle) * 1.5 + 5, 7, 3) - 0.5) * 10;
}

/** 지형 높이 (물 아래면 음수) */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const d = coastRadius(Math.atan2(z, x)) - r; // 양수면 내륙
  let h: number;
  if (d < 0) {
    h = Math.max(-4, -0.25 + d * 0.4);
  } else {
    const flat = Math.min(
      smoothstep(7, 16, Math.hypot(x - SPAWN.x, z - SPAWN.z)),
      smoothstep(2, 7, distToPath(x, z)),
    );
    const hills = smoothstep(4, 18, d) * fbm(x * 0.06 + 11, z * 0.06 + 3, 3, 3) * 5.5 * (0.35 + 0.65 * flat);
    h = -0.25 + Math.min(d, 6) * 0.22 + hills;
  }
  // 호수
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r + 4) h = lerp(-1.8, h, smoothstep(LAKE.r - 2, LAKE.r + 3, dl));
  // 강
  const dr = distToRiver(x, z);
  if (dr < RIVER.halfWidth + 3) h = lerp(-1.2, h, smoothstep(RIVER.halfWidth - 1, RIVER.halfWidth + 2.5, dr));
  return h;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 부두 시작점: 해안에서 지형이 부두 높이 아래로 내려가는 지점 */
const DOCK_Y = 0.6;
function findDockStart(): number {
  for (let z = 25; z < 60; z += 0.25) if (terrainHeight(0, z) < DOCK_Y + 0.15) return z - 1.5;
  return 40;
}
const dockStart = findDockStart();
export const DOCK: Rect & { y: number } = { minX: -1.4, maxX: 1.4, minZ: dockStart, maxZ: dockStart + 16, y: DOCK_Y };
export const BRIDGE: Rect & { y: number } = { minX: 16, maxX: 18.6, minZ: -11.5, maxZ: -0.5, y: 0.8 };

const inRect = (r: Rect, x: number, z: number) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

/** 다리 위 높이 (가운데가 볼록) */
export function bridgeHeight(z: number): number {
  const t = (z - BRIDGE.minZ) / (BRIDGE.maxZ - BRIDGE.minZ);
  return BRIDGE.y + 0.6 * Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
}

/** 서 있을 수 있는 곳이면 발 높이, 아니면 null */
export function walkableHeight(x: number, z: number): number | null {
  if (inRect(DOCK, x, z)) return Math.max(DOCK.y, terrainHeight(x, z));
  if (inRect(BRIDGE, x, z)) return Math.max(bridgeHeight(z), terrainHeight(x, z));
  if (Math.abs(x) > MAP_HALF_SIZE - 2 || Math.abs(z) > MAP_HALF_SIZE - 2) return null;
  const h = terrainHeight(x, z);
  return h > 0.05 ? h : null;
}

/** 소품을 놓을 바닥 높이 */
export function groundHeight(x: number, z: number): number {
  return walkableHeight(x, z) ?? terrainHeight(x, z);
}

/** 낚시가 가능한 물이면 종류를, 아니면 null (너무 얕은 물가 제외) */
export function waterTypeAt(x: number, z: number): WaterType | null {
  if (inRect(DOCK, x, z) || inRect(BRIDGE, x, z)) return null;
  if (terrainHeight(x, z) > WATER_LEVEL - 0.15) return null;
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 4) return 'lake';
  const r = Math.hypot(x, z);
  if (distToRiver(x, z) < RIVER.halfWidth + 3 && r < coastRadius(Math.atan2(z, x)) - 1) return 'river';
  return 'sea';
}

/** yaw 방향 앞쪽 (three.js rotation.y 와 같은 규칙: 0이면 +z) */
export function forward(yaw: number): Vec2 {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

export const CAST_MIN_DIST = 3;
export const CAST_MAX_DIST = 12;

export function castDistance(power: number): number {
  return CAST_MIN_DIST + (CAST_MAX_DIST - CAST_MIN_DIST) * Math.min(1, Math.max(0, power));
}

export function castTarget(from: Vec2, yaw: number, power: number): Vec2 {
  const f = forward(yaw);
  const d = castDistance(power);
  return { x: from.x + f.x * d, z: from.z + f.z * d };
}

/** 앞쪽 던질 수 있는 거리 안에 물이 있는지 (안내 문구용) */
export function waterAhead(from: Vec2, yaw: number): WaterType | null {
  for (let p = 0; p <= 1; p += 0.1) {
    const t = castTarget(from, yaw, p);
    const w = waterTypeAt(t.x, t.z);
    if (w) return w;
  }
  return null;
}

// ---------- 소품 ----------

export interface Prop {
  kind: 'tree' | 'pine' | 'rock' | 'bench' | 'lantern' | 'campfire' | 'bush' | 'flower';
  x: number;
  z: number;
  y: number;
  yaw: number;
  scale: number;
  /** 0이면 통과 가능 */
  radius: number;
  /** 꽃 색 등 변형 번호 */
  variant: number;
}

export interface Seat {
  x: number;
  z: number;
  y: number;
  /** 앉았을 때 바라보는 방향 */
  yaw: number;
}

const yawTo = (from: Vec2, to: Vec2) => Math.atan2(to.x - from.x, to.z - from.z);

function buildProps(): { props: Prop[]; seats: Seat[] } {
  const props: Prop[] = [];
  const seats: Seat[] = [];
  const add = (p: Omit<Prop, 'y'>) => props.push({ ...p, y: groundHeight(p.x, p.z) });

  add({ kind: 'campfire', x: CAMPFIRE.x, z: CAMPFIRE.z, yaw: 0, scale: 1, radius: 0.9, variant: 0 });

  const lakeCenter = { x: LAKE.x, z: LAKE.z };
  const benchSpots: { pos: Vec2; face: Vec2 }[] = [
    { pos: { x: CAMPFIRE.x, z: CAMPFIRE.z + 2.8 }, face: CAMPFIRE },
    { pos: { x: CAMPFIRE.x + 2.6, z: CAMPFIRE.z - 1.2 }, face: CAMPFIRE },
    { pos: { x: CAMPFIRE.x - 2.6, z: CAMPFIRE.z - 1.0 }, face: CAMPFIRE },
    { pos: { x: LAKE.x + 1.5, z: LAKE.z + 12 }, face: lakeCenter },
    { pos: { x: LAKE.x - 6.5, z: LAKE.z + 9.5 }, face: lakeCenter },
    { pos: { x: 0, z: DOCK.maxZ - 4 }, face: { x: 0, z: DOCK.maxZ + 10 } },
  ];
  for (const { pos, face } of benchSpots) {
    const yaw = yawTo(pos, face);
    add({ kind: 'bench', x: pos.x, z: pos.z, yaw, scale: 1, radius: 0.8, variant: 0 });
    seats.push({ x: pos.x, z: pos.z, y: groundHeight(pos.x, pos.z), yaw });
  }

  const lanterns: Vec2[] = [
    { x: 2.2, z: 21 }, { x: -1.8, z: 31 }, { x: 2.2, z: DOCK.minZ + 0.6 }, { x: -6.5, z: 9 },
    { x: 15.2, z: 0.6 }, { x: 19.4, z: -12.6 }, { x: -3.6, z: 15 }, { x: 3.6, z: 8 },
  ];
  for (const l of lanterns) add({ kind: 'lantern', x: l.x, z: l.z, yaw: 0, scale: 1, radius: 0.3, variant: 0 });

  const rng = createRng(20261117);
  const clearOf = (x: number, z: number, gap: number) =>
    props.every((p) => Math.hypot(p.x - x, p.z - z) > gap + p.radius * p.scale);
  const reserved = (x: number, z: number) =>
    Math.hypot(x - SPAWN.x, z - SPAWN.z) < PLAZA_RADIUS + 4 ||
    Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z) < 5 ||
    Math.hypot(x - (BRIDGE.minX + BRIDGE.maxX) / 2, z - (BRIDGE.minZ + BRIDGE.maxZ) / 2) < 8 ||
    (Math.abs(x) < 4 && z > DOCK.minZ - 4);

  const scatter = (kind: Prop['kind'], count: number, attempts: number, accept: (x: number, z: number, h: number) => boolean, opts: { radius: number; gap: number; scale: [number, number]; variants?: number }) => {
    let placed = 0;
    for (let i = 0; i < attempts && placed < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * (ISLAND_RADIUS - 2);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (reserved(x, z) || !accept(x, z, h) || !clearOf(x, z, opts.gap)) continue;
      add({ kind, x, z, yaw: rng() * Math.PI * 2, scale: randRange(rng, ...opts.scale), radius: opts.radius, variant: Math.floor(rng() * (opts.variants ?? 1)) });
      placed++;
    }
  };

  const awayFromWater = (x: number, z: number, h: number, margin: number) =>
    h > 0.6 && Math.hypot(x - LAKE.x, z - LAKE.z) > LAKE.r + margin && distToRiver(x, z) > RIVER.halfWidth + margin && distToPath(x, z) > 2.4;

  scatter('tree', 55, 900, (x, z, h) => awayFromWater(x, z, h, 4) && h < 4.5, { radius: 0.55, gap: 2.6, scale: [0.85, 1.35], variants: 3 });
  scatter('pine', 35, 900, (x, z, h) => awayFromWater(x, z, h, 4) && h > 1.4, { radius: 0.5, gap: 2.4, scale: [0.9, 1.5] });
  scatter('rock', 26, 600, (x, z, h) => h > 0.15 && distToPath(x, z) > 2, { radius: 0.7, gap: 1.6, scale: [0.5, 1.4], variants: 2 });
  scatter('bush', 40, 600, (x, z, h) => awayFromWater(x, z, h, 2), { radius: 0, gap: 1.2, scale: [0.6, 1.1] });
  scatter('flower', 90, 900, (x, z, h) => h > 0.4 && distToPath(x, z) > 1.4, { radius: 0, gap: 0.6, scale: [0.8, 1.2], variants: 4 });

  return { props, seats };
}

const built = buildProps();
export const PROPS: readonly Prop[] = built.props;
export const SEATS: readonly Seat[] = built.seats;
export const COLLIDERS: readonly Prop[] = PROPS.filter((p) => p.radius > 0);

/** 발 위치를 소품 충돌 원 밖으로 밀어낸다 */
export function resolveColliders(x: number, z: number, bodyRadius: number): Vec2 {
  let px = x;
  let pz = z;
  for (const c of COLLIDERS) {
    const min = c.radius * c.scale + bodyRadius;
    const dx = px - c.x;
    const dz = pz - c.z;
    const d = Math.hypot(dx, dz);
    if (d < min && d > 1e-6) {
      px = c.x + (dx / d) * min;
      pz = c.z + (dz / d) * min;
    }
  }
  return { x: px, z: pz };
}
