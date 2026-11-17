/** 0 이상 1 미만을 돌려주는 난수 함수. 서버·클라이언트·테스트가 같은 규칙으로 주입한다. */
export type Rng = () => number;

/** 시드 고정 난수 (mulberry32). 맵 소품 배치처럼 모두에게 같아야 하는 곳에 쓴다. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}
