import { useState } from 'react';
import { dayPhase } from '@fishing/shared';
import { audio } from '../game/audio';
import { clock } from '../game/clock';
import { useProfile } from '../game/profile';
import { CHARACTERS, CHARACTER_LABEL, type CharacterId } from '../scene/character/assets';
import { useGame } from '../game/store';

export function StartScreen() {
  const saved = useProfile();
  const [name, setName] = useState(saved.nickname);
  const [character, setCharacter] = useState<CharacterId>(saved.character);
  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 12;

  const start = () => {
    if (!valid) return;
    saved.setIdentity(trimmed, character);
    audio.init(() => dayPhase(clock.tod()) === 'night');
    audio.setMuted(useGame.getState().muted);
    useGame.setState({ started: true });
  };

  return (
    <div className="start">
      <form
        className="start-card"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <h1>윤슬 낚시터</h1>
        <p className="lead">물결이 반짝이는 작은 섬에서, 느긋하게 한 마리.</p>
        <label className="field">
          <span>닉네임</span>
          <input value={name} maxLength={12} placeholder="2~12자" autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>캐릭터</span>
          <div className="chips" role="radiogroup" aria-label="캐릭터">
            {CHARACTERS.map((c) => (
              <button
                type="button"
                key={c}
                role="radio"
                aria-checked={c === character}
                className={c === character ? 'chip on' : 'chip'}
                onClick={() => setCharacter(c)}
              >
                {CHARACTER_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
        <button className="primary" type="submit" disabled={!valid}>
          섬으로 들어가기
        </button>
        <ul className="keys">
          <li><kbd>WASD</kbd> 이동 · <kbd>Shift</kbd> 달리기</li>
          <li><kbd>드래그</kbd> 시점 · <kbd>휠</kbd> 확대</li>
          <li><kbd>Space</kbd> 낚시 · <kbd>E</kbd> 앉기 · <kbd>B</kbd> 도감</li>
        </ul>
      </form>
    </div>
  );
}
