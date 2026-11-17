import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3, type Group } from 'three';
import { COLLIDERS, SEATS, SPAWN, groundHeight, resolveColliders, walkableHeight } from '@fishing/shared';
import { cancelFishing, fishing, nearestGroundFish, pickUpGroundFish } from '../game/fishing';
import { fx } from '../game/fx';
import { input } from '../game/input';
import { camState, player, setPose } from '../game/player';
import { useProfile } from '../game/profile';
import { ACTIVE_FISHING, patchGame, useGame } from '../game/store';
import { Avatar } from './Avatar';

const WALK = 4.2;
const RUN = 6.8;
const BODY_RADIUS = 0.35;
const SEAT_RANGE = 1.8;

player.pos.set(SPAWN.x, groundHeight(SPAWN.x, SPAWN.z), SPAWN.z);

const camTarget = new Vector3();
const camDesired = new Vector3();
/** 카메라가 바라보는 점 (부드럽게 따라감) */
const camLook = new Vector3();

function angleDamp(cur: number, target: number, k: number, dt: number) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * (1 - Math.exp(-k * dt));
}

const CANOPIES = COLLIDERS.filter((c) => c.kind === 'tree' || c.kind === 'pine').map((c) => ({
  x: c.x,
  z: c.z,
  r: (c.kind === 'tree' ? 1.15 : 1.05) * c.scale,
  top: c.y + 3.4 * c.scale,
}));

/** 캐릭터→카메라 사이에 나무가 끼면 그 앞까지 카메라를 당긴다 */
function occludedFraction(from: Vector3, to: Vector3): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return 1;
  let best = 1;
  for (const c of CANOPIES) {
    // 선분-원 교차 (xz 평면)
    const fx = from.x - c.x;
    const fz = from.z - c.z;
    const b = fx * dx + fz * dz;
    const cc = fx * fx + fz * fz - c.r * c.r;
    const disc = b * b - len2 * cc;
    if (disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / len2;
    if (t <= 0.05 || t >= best) continue;
    if (from.y + (to.y - from.y) * t < c.top) best = t;
  }
  return best;
}

function tryMove(x: number, z: number): boolean {
  if (walkableHeight(x, z) === null) return false;
  const r = resolveColliders(x, z, BODY_RADIUS);
  if (walkableHeight(r.x, r.z) === null) return false;
  player.pos.x = r.x;
  player.pos.z = r.z;
  return true;
}

function nearestSeat() {
  let best: (typeof SEATS)[number] | null = null;
  let bestD = SEAT_RANGE;
  for (const s of SEATS) {
    const d = Math.hypot(s.x - player.pos.x, s.z - player.pos.z);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

function standUp() {
  const s = player.seat;
  if (!s) return;
  player.seat = null;
  // 벤치 앞쪽으로 한 걸음
  player.pos.x = s.x + Math.sin(s.yaw) * 0.9;
  player.pos.z = s.z + Math.cos(s.yaw) * 0.9;
  if (!player.held) setPose('idle');
  patchGame({ sitting: false });
}

function useCameraDrag() {
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      camState.yaw -= (e.clientX - lx) * 0.006;
      camState.pitch = Math.min(1.25, Math.max(0.12, camState.pitch + (e.clientY - ly) * 0.004));
      lx = e.clientX;
      ly = e.clientY;
    };
    const up = () => (dragging = false);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      camState.dist = Math.min(18, Math.max(4, camState.dist + e.deltaY * 0.01));
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl]);
}

export function PlayerController() {
  const group = useRef<Group>(null);
  const nickname = useProfile((s) => s.nickname);
  const color = useProfile((s) => s.color);
  const heldSpeciesId = useGame((s) => s.heldSpeciesId);
  useCameraDrag();

  useFrame(({ camera, clock: c }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const ui = useGame.getState();
    player.poseTime += dt;

    if (!ui.started) {
      // 시작 화면: 광장 주변을 천천히 도는 카메라
      const a = c.elapsedTime * 0.05;
      camera.position.set(SPAWN.x + Math.cos(a) * 34, 20, SPAWN.z + Math.sin(a) * 34);
      camera.lookAt(SPAWN.x, 1, SPAWN.z);
      return;
    }

    const blocked = ui.dexOpen || fishing.phase === 'landing';
    const ix = blocked ? 0 : Number(input.isHeld('right')) - Number(input.isHeld('left'));
    const iz = blocked ? 0 : Number(input.isHeld('up')) - Number(input.isHeld('down'));
    const moving = ix !== 0 || iz !== 0;

    if (moving && ACTIVE_FISHING.includes(fishing.phase)) cancelFishing();
    if (moving && player.seat) standUp();

    // 줍기 > 앉기 / 일어나기
    const ground = fishing.phase === 'idle' && !player.held ? nearestGroundFish() : null;
    if (!blocked && fishing.phase === 'idle' && input.wasPressed('interact')) {
      if (ground) pickUpGroundFish(ground);
      else if (player.seat) standUp();
      else if (!player.held) {
        const seat = nearestSeat();
        if (seat) {
          player.seat = seat;
          player.pos.set(seat.x, seat.y, seat.z);
          player.yaw = seat.yaw;
          setPose('idle');
          patchGame({ sitting: true });
        }
      }
    }
    patchGame({
      seatPrompt: ground
        ? 'E 물고기 줍기'
        : player.seat
          ? 'E 일어나기'
          : fishing.phase === 'idle' && !player.held && nearestSeat()
            ? 'E 앉기'
            : null,
    });

    if (moving) {
      const fx = -Math.sin(camState.yaw);
      const fz = -Math.cos(camState.yaw);
      let mx = -fz * ix + fx * iz;
      let mz = fx * ix + fz * iz;
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      const speed = input.isHeld('run') ? RUN : WALK;
      const nx = player.pos.x + mx * speed * dt;
      const nz = player.pos.z + mz * speed * dt;
      if (!tryMove(nx, nz) && !tryMove(nx, player.pos.z)) tryMove(player.pos.x, nz);
      player.yaw = angleDamp(player.yaw, Math.atan2(mx, mz), 12, dt);
      player.speed = speed;
    } else {
      player.speed = 0;
    }
    if (fishing.phase === 'idle' && !player.held) setPose('idle');

    if (!player.seat) {
      const h = walkableHeight(player.pos.x, player.pos.z) ?? player.pos.y;
      player.pos.y += (h - player.pos.y) * (1 - Math.exp(-18 * dt));
    }

    if (group.current) {
      group.current.position.copy(player.pos);
      group.current.rotation.y = player.yaw;
    }

    // 대물 연출: 카메라가 캐릭터 쪽으로 당겨지고 살짝 올려다본다
    fx.zoom += (fx.zoomTarget - fx.zoom) * (1 - Math.exp(-4 * dt));
    fx.shake *= Math.exp(-6 * dt);
    const dist = camState.dist * (1 - fx.zoom * 0.45);
    camTarget.set(player.pos.x, player.pos.y + 1.3 + fx.zoom * 0.5, player.pos.z);
    const cp = Math.cos(camState.pitch);
    camDesired.set(
      camTarget.x + Math.sin(camState.yaw) * cp * dist,
      camTarget.y + Math.sin(camState.pitch) * dist,
      camTarget.z + Math.cos(camState.yaw) * cp * dist,
    );
    const occ = occludedFraction(camTarget, camDesired);
    if (occ < 1) camDesired.lerpVectors(camTarget, camDesired, Math.max(0.25, occ - 0.08));
    camDesired.y = Math.max(camDesired.y, groundHeight(camDesired.x, camDesired.z) + 0.6, 0.5);
    camera.position.lerp(camDesired, 1 - Math.exp(-10 * dt));
    // 대물이 솟구치는 동안에는 시선이 물고기를 따라간다
    const fl = fishing.flight;
    if (fishing.phase === 'landing' && fl && (fl.tier === 'big' || fl.tier === 'legend')) camTarget.lerp(fishing.flightPos, 0.5);
    if (camLook.lengthSq() === 0) camLook.copy(camTarget);
    camLook.lerp(camTarget, 1 - Math.exp(-6 * dt));
    camera.lookAt(camLook);
    if (fx.shake > 0.002) {
      camera.position.x += (Math.random() - 0.5) * fx.shake;
      camera.position.y += (Math.random() - 0.5) * fx.shake;
    }
  });

  return (
    <group ref={group}>
      <Avatar state={player} heldSpeciesId={heldSpeciesId} color={color} name={nickname || '낚시꾼'} rodTip={player.rodTip} />
    </group>
  );
}
