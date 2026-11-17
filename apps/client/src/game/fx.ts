import { useGame } from './store';

export interface BurstOptions {
  count: number;
  color: string;
  /** 수평 퍼짐 속도 */
  speed: number;
  /** 위로 솟는 속도 */
  up: number;
  size: number;
  life?: number;
  gravity?: number;
}

/** 화면 연출: 카메라 흔들림·줌, 입자 폭발, 화면 번쩍임 */
export const fx = {
  shake: 0,
  zoom: 0,
  zoomTarget: 0,
  burst: (_x: number, _y: number, _z: number, _o: BurstOptions) => {},
  addShake(v: number) {
    fx.shake = Math.max(fx.shake, v);
  },
};

let flashId = 0;
export function flash(color: string) {
  useGame.setState({ flash: { id: ++flashId, color } });
}

export const WATER_SPRAY = '#eaf7ff';
export const GOLD = '#ffd36a';

/** 화면에 보이는 물고기 길이(m). 캐릭터가 머리 큰 저폴리라 실제보다 조금 키운다. */
export function fishDisplayLength(sizeCm: number): number {
  return 0.25 + (sizeCm / 100) * 0.9;
}
