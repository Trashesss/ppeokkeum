import { describe, expect, it } from 'vitest';
import { BRIDGE, CAMPFIRE, COLLIDERS, DOCK, LAKE, PROPS, SEATS, SPAWN, castTarget, waterAhead, waterTypeAt, walkableHeight } from './map.ts';

describe('맵', () => {
  it('스폰 지점과 모닥불 주변은 걸을 수 있다', () => {
    expect(walkableHeight(SPAWN.x, SPAWN.z)).not.toBeNull();
    expect(walkableHeight(CAMPFIRE.x + 2, CAMPFIRE.z)).not.toBeNull();
  });

  it('호수 가운데는 호수, 섬 바깥은 바다, 강 가운데는 강', () => {
    expect(waterTypeAt(LAKE.x, LAKE.z)).toBe('lake');
    expect(waterTypeAt(0, 60)).toBe('sea');
    expect(waterTypeAt(25, -6)).toBe('river');
    expect(walkableHeight(LAKE.x, LAKE.z)).toBeNull();
  });

  it('부두는 해안에서 시작해 바다로 뻗고, 끝에서 바다로 던질 수 있다', () => {
    expect(walkableHeight(0, DOCK.minZ)).not.toBeNull();
    expect(walkableHeight(0, DOCK.maxZ)).toBe(DOCK.y);
    expect(waterTypeAt(0, DOCK.maxZ + 2)).toBe('sea');
    expect(waterAhead({ x: 0, z: DOCK.maxZ - 0.5 }, 0)).toBe('sea');
  });

  it('다리로 강을 건널 수 있고, 다리 위에서 강에 던질 수 있다', () => {
    const mx = (BRIDGE.minX + BRIDGE.maxX) / 2;
    for (let z = BRIDGE.minZ; z <= BRIDGE.maxZ; z += 0.5) expect(walkableHeight(mx, z)).not.toBeNull();
    const t = castTarget({ x: mx, z: -6 }, Math.PI / 2, 0.3);
    expect(waterTypeAt(t.x, t.z)).toBe('river');
  });

  it('호숫가 남쪽에서 북쪽을 보면 호수가 앞에 있다', () => {
    expect(waterAhead({ x: LAKE.x, z: LAKE.z + LAKE.r + 2.5 }, Math.PI)).toBe('lake');
  });

  it('소품은 모두 땅 위에 있고 스폰 지점을 막지 않는다', () => {
    expect(PROPS.length).toBeGreaterThan(100);
    for (const p of PROPS) expect(p.y).toBeGreaterThan(0);
    for (const c of COLLIDERS) expect(Math.hypot(c.x - SPAWN.x, c.z - SPAWN.z)).toBeGreaterThan(1.5);
  });

  it('벤치 자리는 모두 걸을 수 있는 곳', () => {
    expect(SEATS.length).toBe(6);
    for (const s of SEATS) expect(walkableHeight(s.x, s.z)).not.toBeNull();
  });

  it('부두 벤치에 앉아서도 바다로 던질 수 있고, 부두 끝자리는 비어 있다', () => {
    const dockSeat = SEATS.find((s) => s.z > DOCK.minZ)!;
    expect(waterAhead(dockSeat, dockSeat.yaw)).toBe('sea');
    for (const c of COLLIDERS) expect(Math.hypot(c.x, c.z - (DOCK.maxZ - 0.8))).toBeGreaterThan(c.radius + 0.6);
  });
});
