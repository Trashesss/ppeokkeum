/**
 * 키보드·화면 버튼을 "행동" 단위로 바꾼다.
 * 게임 로직은 키가 아니라 행동만 본다. 3단계에서 터치 입력은 press/release 만 호출하면 된다.
 */
export type Action = 'up' | 'down' | 'left' | 'right' | 'run' | 'jump' | 'fish' | 'interact' | 'release' | 'brag' | 'cancel' | 'dex';

const KEYMAP: Record<string, Action> = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'jump',
  KeyQ: 'fish',
  KeyE: 'interact',
  KeyR: 'release',
  KeyF: 'brag',
  Escape: 'cancel',
  KeyB: 'dex',
};

/**
 * 눌림은 다음 프레임이 끝날 때까지만 유효하다. 결과 창에서 누른 Q가 다음 캐스팅으로 새지 않게 하면서,
 * 시간 기준이 아니라 프레임 기준이라 저사양 기기(느린 프레임)에서도 눌림이 사라지지 않는다.
 */
let frame = 0;

const held = new Set<Action>();
const pressedAt = new Map<Action, number>();
const releasedAt = new Map<Action, number>();
const listeners = new Set<(a: Action) => void>();

function fresh(map: Map<Action, number>, a: Action): boolean {
  const f = map.get(a);
  if (f === undefined) return false;
  map.delete(a);
  return frame - f <= 1;
}

export const input = {
  isHeld: (a: Action) => held.has(a),
  /** 눌림을 한 번만 소비한다 */
  wasPressed: (a: Action) => fresh(pressedAt, a),
  wasReleased: (a: Action) => fresh(releasedAt, a),
  press(a: Action) {
    if (held.has(a)) return;
    held.add(a);
    pressedAt.set(a, frame);
    for (const l of listeners) l(a);
  },
  release(a: Action) {
    if (!held.delete(a)) return;
    releasedAt.set(a, frame);
  },
  /** UI가 눌림 순간에 반응해야 할 때 (도감 열기 등) */
  onPress(l: (a: Action) => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** 프레임 끝에 한 번 호출 (InputTicker) */
  endFrame() {
    frame++;
  },
  clear() {
    for (const a of held) releasedAt.set(a, frame);
    held.clear();
  },
};

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};

export function bindKeyboard(): () => void {
  const down = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code];
    if (!a || typing(e)) return;
    e.preventDefault();
    if (!e.repeat) input.press(a);
  };
  const up = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code];
    if (a) input.release(a);
  };
  const blur = () => input.clear();
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  };
}
