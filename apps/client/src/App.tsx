import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect } from 'react';
import { bindKeyboard, input } from './game/input';
import { Environment } from './scene/Environment';
import { Fishing } from './scene/Fishing';
import { GroundFish } from './scene/GroundFish';
import { Particles } from './scene/Particles';
import { PlayerController } from './scene/PlayerController';
import { Props } from './scene/Props';
import { World } from './scene/World';
import { Hud } from './ui/Hud';
import { FishShowcase } from './dev/FishShowcase';

const SHOWCASE = import.meta.env.DEV && new URLSearchParams(location.search).get('showcase') === 'fish';

/** 모든 useFrame 다음에 실행되도록 Canvas 의 마지막 자식으로 둔다 */
function InputTicker() {
  useFrame(() => input.endFrame());
  return null;
}

export function App() {
  useEffect(() => bindKeyboard(), []);
  if (SHOWCASE) return <FishShowcase />;
  return (
    <>
      <Canvas shadows dpr={[1, 1.75]} camera={{ fov: 50, near: 0.1, far: 400, position: [20, 12, 30] }}>
        <Environment />
        <World />
        <Props />
        <PlayerController />
        <Fishing />
        <GroundFish />
        <Particles />
        <InputTicker />
      </Canvas>
      <Hud />
    </>
  );
}
