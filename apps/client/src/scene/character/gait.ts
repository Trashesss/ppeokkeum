import { AnimationMixer, Quaternion, Vector3, type AnimationClip, type Object3D } from 'three';

/** 제자리 걷기·달리기 클립의 보행 정보 */
export interface Gait {
  /** 땅에 닿은 발이 뒤로 밀리는 속도 = 몸이 나아가야 할 속도 (모델 로컬 단위/초, 루트 스케일 적용 전) */
  speed: number;
  /** 왼발이 가장 앞에 오는 정규화 시각 (0~1). 클립끼리 발 위상을 맞출 때 쓴다 */
  phase0: number;
}

const SAMPLES = 120;
/** 발 높이가 최저점에서 이 비율 안이면 땅에 닿은 것으로 본다 */
const CONTACT = 0.2;

// 모든 캐릭터가 같은 Rig_Medium 이라 클립별로 한 번만 잰다
const cache = new WeakMap<AnimationClip, Gait | null>();

/**
 * 클립을 몇 번 재생해 보고 발이 땅에 닿아 있는 동안의 속도를 잰다.
 * 달리기는 두 발이 다 뜨는 구간이 있어 주기 전체로 평균 내면 절반쯤으로 낮게 나온다.
 * 재고 나면 뼈 자세를 원래대로 돌려 둔다.
 */
export function measureGait(root: Object3D, clip: AnimationClip): Gait | null {
  if (cache.has(clip)) return cache.get(clip)!;
  const feet = [root.getObjectByName('footl'), root.getObjectByName('footr')];
  if (!feet[0] || !feet[1]) return null;

  const saved: [Object3D, Vector3, Quaternion, Vector3][] = [];
  root.traverse((o) => saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));

  const mixer = new AnimationMixer(root);
  mixer.clipAction(clip).play();
  const pts: Vector3[][] = [[], []];
  for (let i = 0; i <= SAMPLES; i++) {
    mixer.setTime((clip.duration * i) / SAMPLES);
    root.updateWorldMatrix(true, true);
    feet.forEach((f, k) => pts[k]!.push(root.worldToLocal(f!.getWorldPosition(new Vector3()))));
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  for (const [o, p, q, s] of saved) {
    o.position.copy(p);
    o.quaternion.copy(q);
    o.scale.copy(s);
  }
  root.updateWorldMatrix(true, true);

  const step = clip.duration / SAMPLES;
  let sum = 0;
  let n = 0;
  for (const p of pts) {
    const ys = p.map((v) => v.y);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    for (let i = 0; i < SAMPLES; i++) {
      if (p[i]!.y > lo + CONTACT * (hi - lo)) continue;
      // 캐릭터 앞은 +Z. 딛은 발은 -Z 로 밀린다
      sum += -(p[i + 1]!.z - p[i]!.z) / step;
      n++;
    }
  }
  const left = pts[0]!.map((v) => v.z);
  const gait = n > 0 && sum > 0 ? { speed: sum / n, phase0: left.indexOf(Math.max(...left)) / SAMPLES } : null;
  cache.set(clip, gait);
  return gait;
}
