import { RARITY_LABEL, getSpecies } from '@fishing/shared';
import { bragHeld, stashHeld } from '../game/fishing';
import { input } from '../game/input';
import type { CatchResult } from '../game/store';
import { FishIcon } from './FishIcon';

/** 손에 든 물고기 정보. 화면을 막지 않아 들고 걸어 다닐 수 있다. */
export function CatchCard({ result, throwing }: { result: CatchResult; throwing: boolean }) {
  const s = getSpecies(result.speciesId);
  if (!s) return null;
  return (
    <aside className={`catch-card rarity-${s.rarity}`} aria-label="들고 있는 물고기">
      <div className="badges">
        <span className="rarity">{RARITY_LABEL[s.rarity]}</span>
        {result.isNew && <span className="badge new">처음 잡았어요!</span>}
        {result.isRecord && <span className="badge">최고 기록!</span>}
      </div>
      <FishIcon species={s} size={120} />
      <h2>{s.name}</h2>
      <p className="size">{result.sizeCm.toFixed(1)} cm</p>
      <p className="desc">{s.description}</p>
      <div className="card-actions">
        <button className="primary" disabled={throwing} onClick={stashHeld}>
          바구니에 넣기 <kbd>Q</kbd>
        </button>
        <button
          className="ghost"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            input.press('release');
          }}
          onPointerUp={() => input.release('release')}
          onPointerCancel={() => input.release('release')}
        >
          {throwing ? '놓으면 던져요' : '꾹 눌러 던지기'} <kbd>R</kbd>
        </button>
        <button className="ghost" disabled={throwing} onClick={bragHeld}>
          자랑하기 <kbd>F</kbd>
        </button>
      </div>
      <p className="hint">물에 던지면 놓아주고, 땅에 던지면 파닥거려요</p>
    </aside>
  );
}
