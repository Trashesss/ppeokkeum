import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3, type Group } from 'three';
import { COLLIDERS, SEATS, SPAWN, groundHeight, resolveColliders, walkableHeight } from '@fishing/shared';
import { cancelFishing, fishing, nearestGroundFish, pickUpGroundFish } from '../game/fishing';
import { fx } from '../game/fx';
import { angleDamp } from '../game/angles';
import { input } from '../game/input';
import { JUMP, MOVE, camState, player, setPose } from '../game/player';
import { useProfile } from '../game/profile';
import { ACTIVE_FISHING, patchGame, useGame } from '../game/store';
import { Avatar } from './Avatar';

/** 목표 속도를 따라가는 빠르기 (가속·감속). 10 이면 약 0.3초에 거의 다 붙는다 */
const ACCEL = 10;
const BODY_RADIUS = 0.35;
const SEAT_RANGE = 1.8;

player.pos.set(SPAWN.x, groundHeight(SPAWN.x, SPAWN.z), SPAWN.z);

/** 이동 중인 속도와 방향. 손을 떼도 방향을 유지한 채 감속한다 */
const motion = { speed: 0, dx: 0, dz: 1 };

const camTarget = new Vector3();
const camDesired = new Vector3();
/** 카메라가 바라보는 점 (부드럽게 따라감) */
const camLook = new Vector3();

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
  const character = useProfile((s) => s.character);
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
          motion.speed = 0;
          player.speed = 0;
          player.jump = 'none';
          player.vy = 0;
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

    let targetSpeed = 0;
    if (moving && !player.seat) {
      const fx = -Math.sin(camState.yaw);
      const fz = -Math.cos(camState.yaw);
      const mx = -fz * ix + fx * iz;
      const mz = fx * ix + fz * iz;
      const len = Math.hypot(mx, mz);
      motion.dx = mx / len;
      motion.dz = mz / len;
      const run = input.isHeld('run');
      // 물고기를 들면 한 단계 느리게: 기본은 걷기, Shift 는 종종걸음
      targetSpeed = player.held ? (run ? MOVE.jog : MOVE.walk) : run ? MOVE.run : MOVE.jog;
      player.yaw = angleDamp(player.yaw, Math.atan2(motion.dx, motion.dz), 12, dt);
    }
    motion.speed += (targetSpeed - motion.speed) * (1 - Math.exp(-ACCEL * dt));
    if (targetSpeed === 0 && motion.speed < 0.05) motion.speed = 0;

    // 애니메이션은 입력이 아니라 실제로 움직인 거리를 따른다 (벽에 막히거나 비껴 미끄러질 때)
    let moved = 0;
    if (motion.speed > 0 && !player.seat && dt > 0) {
      const px = player.pos.x;
      const pz = player.pos.z;
      const nx = px + motion.dx * motion.speed * dt;
      const nz = pz + motion.dz * motion.speed * dt;
      if (!tryMove(nx, nz) && !tryMove(nx, pz)) tryMove(px, nz);
      moved = Math.hypot(player.pos.x - px, player.pos.z - pz) / dt;
    }
    // 충돌 보정으로 생기는 프레임별 떨림만 걸러낸다
    player.speed += (moved - player.speed) * (1 - Math.exp(-20 * dt));
    if (moved === 0 && player.speed < 0.05) player.speed = 0;
    if (fishing.phase === 'idle' && !player.held) setPose('idle');

    // 점프: 낚시를 하지 않을 때만 (물고기를 든 채로는 가능)
    const canJump =
      !blocked &&
      !player.seat &&
      (fishing.phase === 'idle' || fishing.phase === 'holding') &&
      (player.jump === 'none' || player.jump === 'land');
    if (canJump && input.wasPressed('jump')) {
      player.jump = 'takeoff';
      player.jumpTime = 0;
    }
    player.jumpTime += dt;
    const floorY = walkableHeight(player.pos.x, player.pos.z) ?? player.pos.y;
    if (player.jump === 'takeoff' && player.jumpTime >= JUMP.takeoff) {
      player.jump = 'air';
      player.jumpTime = 0;
      player.vy = JUMP.speed;
    }
    if (player.jump === 'air') {
      player.vy -= JUMP.gravity * dt;
      player.pos.y += player.vy * dt;
      // 계단·부두처럼 높은 곳으로 뛰어오르면 발밑을 따라 올린다
      if (player.pos.y < floorY) {
        player.pos.y = floorY;
        if (player.vy < 0) {
          player.jump = 'land';
          player.jumpTime = 0;
          player.vy = 0;
        }
      }
    } else if (!player.seat) {
      player.pos.y += (floorY - player.pos.y) * (1 - Math.exp(-18 * dt));
    }
    if (player.jump === 'land' && player.jumpTime >= (player.speed > 0.5 ? JUMP.landMoving : JUMP.land)) {
      player.jump = 'none';
    }

    if (group.current) {
      group.current.position.copy(player.pos);
      group.current.rotation.y = player.yaw;
    }

    // 대물 연출: 카메라가 캐릭터 쪽으로 당겨지고 살짝 올려다본다
    fx.zoom += (fx.zoomTarget - fx.zoom) * (1 - Math.exp(-4 * dt));
    fx.shake *= Math.exp(-6 * dt);
    const dist = camState.dist * (1 - fx.zoom * 0.45);
    // 점프 높이는 카메라에 조금만 반영해 화면이 덜 출렁이게 한다
    const camY = player.jump === 'air' ? floorY + (player.pos.y - floorY) * 0.35 : player.pos.y;
    camTarget.set(player.pos.x, camY + 1.3 + fx.zoom * 0.5, player.pos.z);
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
      <Avatar state={player} character={character} heldSpeciesId={heldSpeciesId} name={nickname || '낚시꾼'} rodTip={player.rodTip} />
    </group>
  );
}
