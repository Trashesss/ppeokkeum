import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { DoubleSide, MeshStandardMaterial, type BufferGeometry } from 'three';
import type { FishSpecies } from '@fishing/shared';
import { buildFishGeometry } from './build';
import { shapeFor } from './shapes';

const cache = new Map<string, BufferGeometry>();

function geometryFor(species: FishSpecies): BufferGeometry {
  let g = cache.get(species.id);
  if (!g) {
    g = buildFishGeometry(shapeFor(species));
    cache.set(species.id, g);
  }
  return g;
}

export interface FlopControl {
  /** 파닥임 세기: 0 = 가만히, 0.05 = 손에 들고 있을 때, 0.15 = 땅에서 펄떡 */
  amp: number;
  freq: number;
}

/**
 * 물고기 메시 + 파닥임 셰이더. flop 객체를 바꾸면 다음 프레임부터 반영된다.
 * 길이 1 기준이라 scale 로 실제 크기를 준다.
 */
export function FishMesh({ species, flop }: { species: FishSpecies; flop: FlopControl }) {
  const shape = shapeFor(species);
  const geometry = geometryFor(species);
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ vertexColors: true, flatShading: true, side: DoubleSide, roughness: 0.55, metalness: 0.05 });
    if (shape.glow) {
      m.emissive.set(shape.colors.back);
      m.emissiveIntensity = shape.glow;
    }
    const uniforms = { uTime: { value: Math.random() * 10 }, uAmp: { value: 0 }, uFreq: { value: 8 } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      const bend =
        shape.kind === 'ray'
          ? 'transformed.y += sin(uTime * uFreq * 0.6 - position.z * 3.0) * uAmp * abs(position.x) * 1.8;'
          : 'float tw = pow(clamp(0.55 - position.z, 0.0, 1.1), 1.4); transformed.x += sin(uTime * uFreq + position.z * 4.0) * uAmp * (0.12 + tw);';
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uAmp;\nuniform float uFreq;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${bend}`);
    };
    m.userData.u = uniforms;
    return m;
  }, [shape]);

  useFrame((_, dt) => {
    const u = material.userData.u as { uTime: { value: number }; uAmp: { value: number }; uFreq: { value: number } };
    u.uTime.value += dt;
    u.uAmp.value += (flop.amp - u.uAmp.value) * Math.min(1, dt * 8);
    u.uFreq.value = flop.freq;
  });

  return <mesh geometry={geometry} material={material} castShadow />;
}
