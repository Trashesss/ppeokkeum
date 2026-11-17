import { useLoader } from '@react-three/fiber';
import { useMemo } from 'react';
import type { AnimationClip, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export const CHARACTERS = ['Ranger', 'Rogue', 'Rogue_Hooded', 'Barbarian', 'Knight', 'Mage'] as const;
export type CharacterId = (typeof CHARACTERS)[number];

export const CHARACTER_LABEL: Record<CharacterId, string> = {
  Ranger: '레인저',
  Rogue: '로그',
  Rogue_Hooded: '후드 로그',
  Barbarian: '바바리안',
  Knight: '기사',
  Mage: '마법사',
};

const base = import.meta.env.BASE_URL;
const ANIM_FILES = ['General', 'MovementBasic', 'Simulation', 'Tools'].map((f) => `${base}models/anims/${f}.glb`);

export function characterUrl(id: CharacterId) {
  return `${base}models/characters/${id}.glb`;
}

/** 애니메이션 클립 (모든 캐릭터가 같은 Rig_Medium 뼈대라 공유) */
export function useClips(): Map<string, AnimationClip> {
  const gltfs = useLoader(GLTFLoader, ANIM_FILES);
  return useMemo(() => {
    const m = new Map<string, AnimationClip>();
    for (const g of gltfs) for (const c of g.animations) m.set(c.name, c);
    return m;
  }, [gltfs]);
}

/** 캐릭터 모델 복제본 (여러 명이 같은 모델을 써도 뼈대가 따로 움직이도록) */
export function useCharacterModel(id: CharacterId): Object3D {
  const gltf = useLoader(GLTFLoader, characterUrl(id));
  return useMemo(() => {
    const root = cloneSkinned(gltf.scene);
    root.traverse((o) => {
      o.castShadow = true;
      // 무기 관련 소품(화살통)은 낚시꾼 분위기에 맞지 않아 숨긴다
      if (o.name.includes('Quiver')) o.visible = false;
    });
    return root;
  }, [gltf]);
}

for (const url of [...ANIM_FILES, ...CHARACTERS.map(characterUrl)]) useLoader.preload(GLTFLoader, url);
