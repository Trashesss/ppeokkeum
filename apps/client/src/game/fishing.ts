import { Euler, Vector3 } from 'three';
import {
  BITE_WINDOW_S, WATER_LABEL, castTarget, catchTier, createReel, dayPhase, forward, getSpecies, groundHeight,
  isValidReaction, rollBiteDelay, rollCatch, stepReel, surging, waterAhead, waterTypeAt,
  type CatchRoll, type CatchTier, type ReelState, type WaterType,
} from '@fishing/shared';
import { audio, catchAudio } from './audio';
import { FAST_BITE, clock } from './clock';
import { GOLD, WATER_SPRAY, flash, fx } from './fx';
import { input } from './input';
import { carryStyle, player, setPose, type Pose } from './player';
import { useProfile } from './profile';
import { patchGame, showToast, useGame, type CatchResult, type FishingPhase, type GroundFishItem } from './store';

/**
 * 낚시 상태 머신. 판정(출현표·입질·미니게임)은 shared 함수만 호출한다.
 * 1단계에서는 rollCatch·rollBiteDelay 를 서버가 실행하고 클라이언트는 결과만 받는다.
 */

export interface Flight {
  kind: 'landing' | 'throw';
  tier: CatchTier;
  from: Vector3;
  to: Vector3;
  u: number;
  dur: number;
  arc: number;
  /** 던진 물고기가 떨어질 곳의 물 종류 (땅이면 null) */
  water: WaterType | null;
  sparkled: boolean;
}

export const fishing = {
  phase: 'idle' as FishingPhase,
  t: 0,
  power: 0,
  from: new Vector3(),
  target: new Vector3(),
  bobber: new Vector3(),
  bobberVisible: false,
  dip: 0,
  nibble: 0,
  water: null as WaterType | null,
  biteIn: 0,
  /** 입질 시작 실제 시각(ms). 반응 시간은 프레임 제한과 무관하게 실제 시간으로 잰다 */
  biteAt: 0,
  roll: null as CatchRoll | null,
  reel: null as ReelState | null,
  pending: null as CatchResult | null,
  flight: null as Flight | null,
  flightPos: new Vector3(),
  flightRot: new Euler(),
  bragUntil: 0,
  groundFish: [] as GroundFishItem[],
  onRipple: (_x: number, _z: number, _strength: number) => {},
};

const CAST_FLIGHT_S = 0.7;

/** 등급별 낚아올리기 연출 */
const LANDING: Record<CatchTier, { dur: number; arc: number; splash: number; shake: number; zoom: number }> = {
  small: { dur: 0.45, arc: 1.3, splash: 10, shake: 0, zoom: 0 },
  medium: { dur: 0.8, arc: 2.3, splash: 24, shake: 0.06, zoom: 0.15 },
  big: { dur: 1.4, arc: 3.3, splash: 48, shake: 0.3, zoom: 0.6 },
  legend: { dur: 1.9, arc: 4.2, splash: 64, shake: 0.4, zoom: 0.75 },
};

/** 실시간 진행(u) → 궤적 진행(k). 대물은 꼭대기 근처에서 슬로모션. */
function warp(tier: CatchTier, u: number): number {
  if (tier === 'small' || tier === 'medium') return 1 - (1 - u) * (1 - u);
  const slow = tier === 'legend' ? 0.14 : 0.2;
  if (u < 0.28) return (u / 0.28) * 0.4;
  if (u < 0.75) return 0.4 + ((u - 0.28) / 0.47) * slow;
  return 0.4 + slow + ((u - 0.75) / 0.25) * (0.6 - slow);
}

function go(phase: FishingPhase) {
  fishing.phase = phase;
  fishing.t = 0;
  patchGame({ phase });
}

function pose(p: Pose) {
  // 앉아 있을 땐 크게 젖히는 동작 대신 낚싯대를 잡은 자세로
  if (player.seat && (p === 'charge' || p === 'cast' || p === 'reel' || p === 'heave')) setPose('hold');
  else setPose(p);
}

function nextBiteDelay() {
  return FAST_BITE ? 1 + Math.random() : rollBiteDelay(Math.random);
}

/** 손에 들 때의 물고기 위치 (월드 좌표, 대략) */
function holdAnchor(tier: CatchTier, out: Vector3): Vector3 {
  const f = forward(player.yaw);
  const style = carryStyle(tier);
  const y = style === 'overhead' ? 2.05 : style === 'two' ? 1.05 : 0.95;
  const ahead = style === 'overhead' ? 0.15 : 0.45;
  return out.set(player.pos.x + f.x * ahead, player.pos.y + y, player.pos.z + f.z * ahead);
}

const HOLD_PROMPT = 'Space 바구니에 넣기 · R 길게 눌러 던지기 · F 자랑하기';

export function cancelFishing() {
  fishing.bobberVisible = false;
  fishing.roll = null;
  fishing.reel = null;
  player.hasRod = false;
  player.rodBend = 0;
  pose('idle');
  go('idle');
  patchGame({ charge: 0, reel: null, fishPrompt: null });
}

function startHolding(result: CatchResult, tier: CatchTier, brag: boolean) {
  player.held = { speciesId: result.speciesId, sizeCm: result.sizeCm, tier };
  player.hasRod = false;
  player.rodBend = 0;
  go('holding');
  fishing.bragUntil = brag ? 1.5 : 0;
  pose(brag ? 'brag' : 'carry');
  patchGame({ result, fishPrompt: HOLD_PROMPT, charge: 0, heldSpeciesId: result.speciesId });
}

/** 바구니에 넣기 */
export function stashHeld() {
  if (fishing.phase !== 'holding' || !player.held) return;
  useProfile.getState().settle(true);
  const s = getSpecies(player.held.speciesId);
  player.held = null;
  catchAudio.stash();
  showToast(`${s?.name ?? '물고기'}를 바구니에 넣었어요`);
  pose('idle');
  go('idle');
  patchGame({ result: null, fishPrompt: null, heldSpeciesId: null });
}

/** 화면 버튼용: 자랑하기 */
export function bragHeld() {
  if (fishing.phase !== 'holding') return;
  fishing.bragUntil = fishing.t + 1.6;
  pose('brag');
}

export function nearestGroundFish(range = 1.6): GroundFishItem | null {
  let best: GroundFishItem | null = null;
  let bestD = range;
  for (const g of fishing.groundFish) {
    const d = Math.hypot(g.x - player.pos.x, g.z - player.pos.z);
    if (d < bestD) {
      best = g;
      bestD = d;
    }
  }
  return best;
}

export function pickUpGroundFish(item: GroundFishItem) {
  if (fishing.phase !== 'idle' || player.held) return;
  fishing.groundFish = fishing.groundFish.filter((g) => g.id !== item.id);
  patchGame({ groundFish: fishing.groundFish });
  const species = getSpecies(item.speciesId);
  if (!species) return;
  catchAudio.pop();
  startHolding({ speciesId: item.speciesId, sizeCm: item.sizeCm, isNew: false, isRecord: false }, catchTier(species, item.sizeCm), false);
}

let groundId = 0;

/** 개발·검증용: 다음 입질에 나올 물고기를 고정한다 */
let forcedRoll: CatchRoll | null = null;
export function forceNextCatch(roll: CatchRoll) {
  forcedRoll = roll;
}
const tmp = new Vector3();
const tipWorld = new Vector3();

function startLanding() {
  const f = fishing;
  const species = f.roll && getSpecies(f.roll.speciesId);
  if (!f.roll || !species) return cancelFishing();
  const tier = catchTier(species, f.roll.sizeCm);
  const cfg = LANDING[tier];
  const { isNew, isRecord } = useProfile.getState().recordCatch(f.roll.speciesId, f.roll.sizeCm);
  f.pending = { ...f.roll, isNew, isRecord };

  f.flight = {
    kind: 'landing', tier, from: f.bobber.clone().setY(0), to: holdAnchor(tier, new Vector3()),
    u: 0, dur: cfg.dur, arc: cfg.arc, water: null, sparkled: false,
  };
  f.bobberVisible = false;
  f.onRipple(f.bobber.x, f.bobber.z, tier === 'small' ? 0.8 : 1.6);
  fx.burst(f.bobber.x, 0.05, f.bobber.z, { count: cfg.splash, color: WATER_SPRAY, speed: 1.2 + cfg.shake * 4, up: 3 + cfg.shake * 8, size: 0.07 + cfg.shake * 0.08 });
  fx.addShake(cfg.shake);
  fx.zoomTarget = cfg.zoom;
  if (tier === 'small') catchAudio.pop();
  else if (tier === 'medium') audio.splash();
  else catchAudio.bigSplash();
  pose('heave');
  patchGame({ reel: null, fishPrompt: null, flying: { speciesId: f.roll.speciesId, sizeCm: f.roll.sizeCm } });
  go('landing');
}

function stepFlight(dt: number): boolean {
  const fl = fishing.flight;
  if (!fl) return true;
  fl.u = Math.min(1, fl.u + dt / fl.dur);
  const k = fl.kind === 'landing' ? warp(fl.tier, fl.u) : fl.u;
  if (fl.kind === 'landing') holdAnchor(fl.tier, fl.to);
  fishing.flightPos.lerpVectors(fl.from, fl.to, k);
  fishing.flightPos.y += Math.sin(Math.PI * k) * fl.arc;
  if (fl.kind === 'throw') {
    fishing.flightRot.set(k * Math.PI * 3, player.yaw, 0);
  } else if (fl.tier === 'small' || fl.tier === 'medium') {
    fishing.flightRot.set(-Math.PI / 2 + k * Math.PI * 2, player.yaw, 0);
  } else {
    // 대물: 머리를 하늘로 쳐들고 몸을 비튼다
    fishing.flightRot.set(-Math.PI / 2 + Math.sin(k * Math.PI) * 0.6, player.yaw + Math.sin(k * 9) * 0.3, Math.sin(k * 14) * 0.25);
  }
  if (fl.kind === 'landing' && fl.tier === 'legend' && !fl.sparkled && fl.u > 0.38) {
    fl.sparkled = true;
    flash(GOLD);
    catchAudio.shimmer();
    fx.burst(fishing.flightPos.x, fishing.flightPos.y, fishing.flightPos.z, { count: 50, color: GOLD, speed: 3, up: 2.5, size: 0.08, gravity: -2, life: 1.6 });
  }
  return fl.u >= 1;
}

function arriveLanding() {
  const f = fishing;
  const fl = f.flight;
  const result = f.pending;
  f.flight = null;
  patchGame({ flying: null });
  if (!fl || !result) return cancelFishing();
  const cfg = LANDING[fl.tier];
  fx.burst(fl.to.x, fl.to.y, fl.to.z, { count: 8 + cfg.splash / 4, color: WATER_SPRAY, speed: 1.2, up: 1.5, size: 0.05 });
  if (fl.tier === 'big') {
    catchAudio.fanfare();
    fx.addShake(0.18);
  } else if (fl.tier === 'legend') {
    catchAudio.legend();
    fx.addShake(0.25);
    fx.burst(fl.to.x, fl.to.y, fl.to.z, { count: 40, color: GOLD, speed: 2.2, up: 3, size: 0.07, gravity: -3, life: 1.8 });
  } else if (fl.tier === 'medium') audio.caught();
  f.roll = null;
  f.reel = null;
  startHolding(result, fl.tier, fl.tier === 'big' || fl.tier === 'legend');
}

function launchThrow() {
  const f = fishing;
  const held = player.held;
  if (!held) return go('holding');
  const fw = forward(player.yaw);
  const dist = 2 + f.power * 9;
  const tx = player.pos.x + fw.x * dist;
  const tz = player.pos.z + fw.z * dist;
  const water = waterTypeAt(tx, tz);
  f.flight = {
    kind: 'throw', tier: held.tier,
    from: new Vector3(player.pos.x + fw.x * 0.3, player.pos.y + 1.9, player.pos.z + fw.z * 0.3),
    to: new Vector3(tx, water ? 0 : groundHeight(tx, tz) + 0.12, tz),
    u: 0, dur: 0.5 + f.power * 0.35, arc: 1.2 + f.power * 2.2, water, sparkled: false,
  };
  patchGame({ flying: { speciesId: held.speciesId, sizeCm: held.sizeCm }, charge: 0, result: null, fishPrompt: null, heldSpeciesId: null });
  f.pending = { speciesId: held.speciesId, sizeCm: held.sizeCm, isNew: false, isRecord: false };
  player.held = null;
  catchAudio.whoosh();
  pose('throw');
  go('throwing');
}

function arriveThrow() {
  const f = fishing;
  const fl = f.flight;
  const item = f.pending;
  f.flight = null;
  f.pending = null;
  patchGame({ flying: null });
  pose('idle');
  go('idle');
  if (!fl || !item) return;
  const name = getSpecies(item.speciesId)?.name ?? '물고기';
  if (fl.water) {
    useProfile.getState().settle(false);
    audio.splash();
    f.onRipple(fl.to.x, fl.to.z, 1.2);
    fx.burst(fl.to.x, 0.05, fl.to.z, { count: 18, color: WATER_SPRAY, speed: 1.2, up: 3, size: 0.07 });
    showToast(`${name}를 놓아줬어요. 잘 가!`);
  } else {
    catchAudio.flop();
    f.groundFish = [...f.groundFish, { id: ++groundId, speciesId: item.speciesId, sizeCm: item.sizeCm, x: fl.to.x, y: fl.to.y, z: fl.to.z }];
    patchGame({ groundFish: f.groundFish });
    showToast(`앗, ${name}가 땅에서 파닥거려요! 가까이 가서 E로 주워요`);
  }
}

export function stepFishing(dt: number) {
  const ui = useGame.getState();
  if (!ui.started) return;
  fishing.t += dt;
  const f = fishing;

  if ((f.phase === 'charging' || f.phase === 'casting' || f.phase === 'waiting' || f.phase === 'bite' || f.phase === 'reeling') && input.wasPressed('cancel')) {
    cancelFishing();
    return;
  }

  switch (f.phase) {
    case 'idle': {
      if (ui.dexOpen || player.held) return;
      const w = waterAhead(player.pos, player.yaw);
      patchGame({ fishPrompt: w ? `Space를 길게 눌러 던지기 · ${WATER_LABEL[w]}` : null });
      if (input.wasPressed('fish')) {
        if (!w) {
          showToast('물가에서 물 쪽을 바라보고 던져 보세요');
          return;
        }
        player.hasRod = true;
        pose('charge');
        go('charging');
        patchGame({ fishPrompt: '놓으면 던져요', chargeLabel: '던지는 힘' });
      }
      return;
    }
    case 'charging': {
      const p = (f.t / 1.1) % 2;
      f.power = p < 1 ? p : 2 - p;
      patchGame({ charge: Math.round(f.power * 100) / 100 });
      if (!input.isHeld('fish')) {
        player.rodTip.updateWorldMatrix(true, false);
        f.from.copy(player.rodTip.getWorldPosition(tipWorld));
        const t = castTarget(player.pos, player.yaw, f.power);
        f.water = waterTypeAt(t.x, t.z);
        f.target.set(t.x, f.water ? 0 : groundHeight(t.x, t.z), t.z);
        f.bobberVisible = true;
        audio.cast();
        pose('cast');
        go('casting');
        patchGame({ charge: 0, fishPrompt: null });
      }
      return;
    }
    case 'casting': {
      const k = Math.min(1, f.t / CAST_FLIGHT_S);
      f.bobber.lerpVectors(f.from, f.target, k);
      f.bobber.y += Math.sin(Math.PI * k) * (2 + f.power * 3);
      if (k < 1) return;
      if (!f.water) {
        showToast('물에 닿지 않았어요. 물 쪽으로 던져 볼까요?');
        cancelFishing();
        return;
      }
      audio.splash();
      f.onRipple(f.target.x, f.target.z, 1);
      f.biteIn = nextBiteDelay();
      pose('hold');
      go('waiting');
      patchGame({ fishPrompt: '찌를 지켜보세요 · Esc 거두기' });
      return;
    }
    case 'waiting': {
      player.rodBend = 0.08;
      f.nibble = Math.max(0, f.nibble - dt);
      if (f.nibble === 0 && Math.random() < dt * 0.35) {
        f.nibble = 0.25;
        f.onRipple(f.target.x, f.target.z, 0.35);
      }
      f.dip = f.nibble > 0 ? 0.06 : 0;
      f.bobber.copy(f.target);
      if (input.wasPressed('fish')) {
        showToast('너무 일찍 당겼어요. 찌가 쑥 들어갈 때 당겨요');
        cancelFishing();
        return;
      }
      if (f.t >= f.biteIn && f.water) {
        f.roll = forcedRoll ?? rollCatch(f.water, dayPhase(clock.tod()), Math.random);
        forcedRoll = null;
        audio.bite();
        f.onRipple(f.target.x, f.target.z, 0.9);
        f.biteAt = performance.now();
        go('bite');
        patchGame({ fishPrompt: '지금! Space' });
      }
      return;
    }
    case 'bite': {
      f.dip = 0.28 + Math.sin(f.t * 40) * 0.05;
      player.rodBend = 0.3 + Math.sin(f.t * 30) * 0.12;
      if (input.wasPressed('fish')) {
        if (isValidReaction((performance.now() - f.biteAt) / 1000)) {
          f.reel = createReel(Math.random);
          pose('reel');
          go('reeling');
          patchGame({ fishPrompt: null });
        } else {
          f.biteIn = nextBiteDelay();
          go('waiting');
        }
        return;
      }
      if ((performance.now() - f.biteAt) / 1000 > BITE_WINDOW_S) {
        showToast('미끼만 먹고 갔어요. 조금 더 기다려 봐요');
        f.roll = null;
        f.dip = 0;
        f.biteIn = nextBiteDelay();
        go('waiting');
        patchGame({ fishPrompt: '찌를 지켜보세요 · Esc 거두기' });
      }
      return;
    }
    case 'reeling': {
      const species = f.roll && getSpecies(f.roll.speciesId);
      if (!species || !f.reel) {
        cancelFishing();
        return;
      }
      const wasSurging = surging(f.reel);
      f.reel = stepReel(f.reel, dt, input.isHeld('fish'), species.strength, Math.random);
      const nowSurging = surging(f.reel);
      if (nowSurging && !wasSurging) {
        audio.surge();
        f.onRipple(f.bobber.x, f.bobber.z, 0.7);
        fx.burst(f.bobber.x, 0.05, f.bobber.z, { count: 6 + Math.round(species.strength * 14), color: WATER_SPRAY, speed: 0.8, up: 1.6 + species.strength * 2, size: 0.05 });
        fx.addShake(0.03 + species.strength * 0.1);
      }
      // 장력이 셀수록, 힘센 물고기일수록 낚싯대가 크게 휜다
      player.rodBend = Math.min(1.35, 0.2 + f.reel.tension * (0.6 + species.strength * 0.7) + (nowSurging ? 0.15 : 0));
      const pull = f.reel.progress * 0.6;
      tmp.set((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25).multiplyScalar(nowSurging ? 1 : 0);
      f.bobber.set(f.target.x + (player.pos.x - f.target.x) * pull + tmp.x, 0, f.target.z + (player.pos.z - f.target.z) * pull + tmp.z);
      f.dip = 0.12 + (nowSurging ? 0.12 : 0);
      patchGame({ reel: { tension: f.reel.tension, progress: f.reel.progress, surging: nowSurging } });

      if (f.reel.status === 'caught') startLanding();
      else if (f.reel.status === 'snapped') {
        audio.fail();
        showToast('앗, 줄이 끊어졌어요. 괜찮아요, 다시 던져 봐요');
        cancelFishing();
      } else if (f.reel.status === 'escaped') {
        audio.fail();
        showToast('물고기가 도망갔어요. 다음엔 조금 더 감아 봐요');
        cancelFishing();
      }
      return;
    }
    case 'landing': {
      player.rodBend = Math.max(0, player.rodBend - dt * 2);
      if (stepFlight(dt)) arriveLanding();
      return;
    }
    case 'holding': {
      if (f.bragUntil > 0 && f.t >= f.bragUntil) {
        f.bragUntil = 0;
        pose('carry');
      }
      if (f.t > 1.3) fx.zoomTarget = 0;
      if (input.wasPressed('fish')) stashHeld();
      else if (input.wasPressed('brag')) bragHeld();
      else if (input.wasPressed('release')) {
        f.bragUntil = 0;
        fx.zoomTarget = 0;
        pose('throwCharge');
        go('throwCharge');
        patchGame({ fishPrompt: '놓으면 던져요 · 물에 떨어지면 놓아줘요', chargeLabel: '던질 힘' });
      }
      return;
    }
    case 'throwCharge': {
      const p = (f.t / 1.0) % 2;
      f.power = p < 1 ? p : 2 - p;
      patchGame({ charge: Math.round(f.power * 100) / 100 });
      if (input.wasPressed('cancel')) {
        pose('carry');
        go('holding');
        patchGame({ charge: 0, fishPrompt: HOLD_PROMPT });
      } else if (!input.isHeld('release')) launchThrow();
      return;
    }
    case 'throwing': {
      if (stepFlight(dt)) arriveThrow();
      return;
    }
  }
}
