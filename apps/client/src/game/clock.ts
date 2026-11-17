import { timeOfDay } from '@fishing/shared';

/**
 * 게임 시각. 1단계에서는 서버 시각과의 차이를 offset 에 넣는다.
 * 개발용: ?time=0.5 (정오에서 시작), ?time=0.9 (밤)
 */
const params = new URLSearchParams(location.search);
let offset = 0;
const forced = params.get('time');
if (forced !== null && !Number.isNaN(Number(forced))) {
  const target = ((Number(forced) % 1) + 1) % 1;
  const DAY = 20 * 60 * 1000;
  offset = (target - timeOfDay(Date.now())) * DAY;
}

export const clock = {
  now: () => Date.now() + offset,
  tod: () => timeOfDay(Date.now() + offset),
};

/** 개발용: ?fast 면 입질 대기 1~2초 */
export const FAST_BITE = params.has('fast');
