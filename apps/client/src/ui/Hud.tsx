import { useEffect } from 'react';
import { FISH_SPECIES, SAFE_MAX, SAFE_MIN, dayPhase, formatClock } from '@fishing/shared';
import { audio } from '../game/audio';
import { input } from '../game/input';
import { useProfile } from '../game/profile';
import { useGame } from '../game/store';
import { Dex } from './Dex';
import { CatchCard } from './CatchCard';
import { StartScreen } from './StartScreen';

function Toast() {
  const toast = useGame((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => {
      if (useGame.getState().toast?.id === toast.id) useGame.setState({ toast: null });
    }, 2600);
    return () => window.clearTimeout(id);
  }, [toast]);
  return toast ? (
    <div key={toast.id} className="toast" role="status">
      {toast.text}
    </div>
  ) : null;
}

function ReelMeter() {
  const reel = useGame((s) => s.reel);
  if (!reel) return null;
  const danger = reel.tension > SAFE_MAX;
  return (
    <div className={reel.surging ? 'reel shake' : 'reel'}>
      <div className="reel-label">
        <span>장력</span>
        <span className="muted">누르면 감기 · 떼면 풀기</span>
      </div>
      <div className="tension">
        <div className="safe" style={{ left: `${SAFE_MIN * 100}%`, width: `${(SAFE_MAX - SAFE_MIN) * 100}%` }} />
        <div className={danger ? 'marker danger' : 'marker'} style={{ left: `${reel.tension * 100}%` }} />
      </div>
      <div className="reel-label">
        <span>끌어올리는 중</span>
        <span>{Math.round(reel.progress * 100)}%</span>
      </div>
      <div className="progress">
        <div style={{ width: `${reel.progress * 100}%` }} />
      </div>
    </div>
  );
}

function ChargeBar() {
  const charge = useGame((s) => s.charge);
  const label = useGame((s) => s.chargeLabel);
  const phase = useGame((s) => s.phase);
  if (phase !== 'charging' && phase !== 'throwCharge') return null;
  return (
    <div className="charge-wrap">
      <span className="charge-label">{label}</span>
      <div className="charge" aria-label={label}>
        <div style={{ width: `${charge * 100}%` }} />
      </div>
    </div>
  );
}

function Flash() {
  const flash = useGame((s) => s.flash);
  return flash ? <div key={flash.id} className="flash" style={{ background: `radial-gradient(circle, ${flash.color}cc, transparent 70%)` }} /> : null;
}

function FishButton() {
  const phase = useGame((s) => s.phase);
  const prompt = useGame((s) => s.fishPrompt);
  const active = phase !== 'idle' || !!prompt;
  if (phase === 'landing' || phase === 'holding' || phase === 'throwCharge' || phase === 'throwing') return null;
  return (
    <button
      className={active ? 'fish-btn on' : 'fish-btn'}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        input.press('fish');
      }}
      onPointerUp={() => input.release('fish')}
      onPointerCancel={() => input.release('fish')}
      aria-label="낚시 (Q)"
    >
      🎣
    </button>
  );
}

export function Hud() {
  const started = useGame((s) => s.started);
  const phase = useGame((s) => s.phase);
  const fishPrompt = useGame((s) => s.fishPrompt);
  const seatPrompt = useGame((s) => s.seatPrompt);
  const result = useGame((s) => s.result);
  const dexOpen = useGame((s) => s.dexOpen);
  const muted = useGame((s) => s.muted);
  const tod = useGame((s) => s.tod);
  const nickname = useProfile((s) => s.nickname);
  const found = useProfile((s) => FISH_SPECIES.filter((f) => s.dex[f.id]).length);

  useEffect(
    () =>
      input.onPress((a) => {
        const s = useGame.getState();
        if (!s.started) return;
        if (a === 'dex' && s.phase === 'idle') useGame.setState({ dexOpen: !s.dexOpen });
        if (a === 'cancel' && s.dexOpen) useGame.setState({ dexOpen: false });
      }),
    [],
  );

  if (!started) return <StartScreen />;

  const night = dayPhase(tod) === 'night';
  const toggleMute = () => {
    audio.setMuted(!muted);
    useGame.setState({ muted: !muted });
  };

  return (
    <div className="hud">
      <div className="top-left panel">
        <span className="clock">
          {night ? '☾' : '☀'} {formatClock(tod)}
        </span>
        <span className="muted">{nickname}</span>
      </div>
      <div className="top-right">
        <button className="panel btn" onClick={() => phase === 'idle' && useGame.setState({ dexOpen: !dexOpen })}>
          도감 {found}/{FISH_SPECIES.length} <kbd>B</kbd>
        </button>
        <button className="panel btn" onClick={toggleMute} aria-label={muted ? '소리 켜기' : '소리 끄기'}>
          {muted ? '소리 꺼짐' : '소리 켜짐'}
        </button>
      </div>

      {phase === 'bite' && <div className="bite">!</div>}

      <div className="bottom">
        <Toast />
        <ChargeBar />
        <ReelMeter />
        {!dexOpen && (fishPrompt || seatPrompt) && (
          <div className="prompts">
            {fishPrompt && <span className={phase === 'bite' ? 'pill hot' : 'pill'}>{fishPrompt}</span>}
            {seatPrompt && phase === 'idle' && <span className="pill">{seatPrompt}</span>}
          </div>
        )}
      </div>
      <FishButton />
      <div className="help muted">WASD 이동 · Shift 달리기 · 드래그 시점 · Space 점프 · Q 낚시 · E 앉기 · B 도감</div>

      {result && (phase === 'holding' || phase === 'throwCharge') && <CatchCard result={result} throwing={phase === 'throwCharge'} />}
      <Flash />
      {dexOpen && <Dex />}
    </div>
  );
}
