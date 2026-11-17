/**
 * 각도를 최단 경로로 보간한다 (결과는 -π~π).
 * 숫자를 그대로 보간하면 젖힌 팔(+)에서 앞(-)으로 갈 때 몸 아래로 한 바퀴 돌아
 * 낚싯대가 땅을 파고든다. 최단 경로면 머리 위를 지나 앞으로 휘두른다.
 */
export function angleDamp(cur: number, target: number, k: number, dt: number): number {
  let d = target - cur;
  d = ((((d + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  let next = cur + d * (1 - Math.exp(-k * dt));
  if (next > Math.PI) next -= Math.PI * 2;
  else if (next < -Math.PI) next += Math.PI * 2;
  return next;
}
