import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.DEV) {
  // 개발·자동 검증용 핸들 (프로덕션 빌드에는 포함되지 않음)
  void Promise.all([import('./game/fishing'), import('./game/player'), import('./game/store'), import('./game/profile'), import('@fishing/shared')]).then(
    ([fishingMod, playerMod, storeMod, profileMod, shared]) => {
      (window as unknown as { __game: unknown }).__game = {
        fishing: fishingMod.fishing,
        forceNextCatch: fishingMod.forceNextCatch,
        player: playerMod.player,
        camState: playerMod.camState,
        useGame: storeMod.useGame,
        useProfile: profileMod.useProfile,
        shared,
      };
    },
  );
}
