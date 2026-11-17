import { FISH_SPECIES, RARITY_LABEL, WATER_LABEL } from '@fishing/shared';
import { useProfile } from '../game/profile';
import { useGame } from '../game/store';
import { FishIcon } from './FishIcon';

export function Dex() {
  const dex = useProfile((s) => s.dex);
  const total = useProfile((s) => s.total);
  const kept = useProfile((s) => s.kept);
  const released = useProfile((s) => s.released);
  const found = FISH_SPECIES.filter((s) => dex[s.id]).length;
  const close = () => useGame.setState({ dexOpen: false });

  return (
    <div className="dex-wrap" onClick={close}>
      <section className="dex" role="dialog" aria-label="도감" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>물고기 도감</h2>
            <p className="muted">
              {FISH_SPECIES.length}종 중 <b>{found}</b>종 · 총 {total}마리 (보관 {kept} · 놓아줌 {released})
            </p>
          </div>
          <button className="ghost" onClick={close} aria-label="닫기">
            닫기 <kbd>B</kbd>
          </button>
        </header>
        <div className="dex-grid">
          {FISH_SPECIES.map((s) => {
            const e = dex[s.id];
            const where = `${s.waters.map((w) => WATER_LABEL[w]).join('·')}${s.phase ? ` · ${s.phase === 'day' ? '낮' : '밤'}` : ''}`;
            return (
              <article key={s.id} className={e ? `dex-card rarity-${s.rarity}` : 'dex-card unknown'}>
                <FishIcon species={s} hidden={!e} size={84} />
                <h3>{e ? s.name : '???'}</h3>
                <p className="where">{where}</p>
                {e ? (
                  <p className="stat">
                    최대 {e.bestCm.toFixed(1)}cm · {e.count}마리
                  </p>
                ) : (
                  <p className="stat muted">{RARITY_LABEL[s.rarity]}</p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
