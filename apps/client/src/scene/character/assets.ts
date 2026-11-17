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

/** 어느 캐릭터든 숨기는 소품 (화살통은 낚시꾼 분위기에 맞지 않는다) */
const HIDE_ALWAYS = ['Quiver'];
/** 기사만 망토·투구를 유지하고, 나머지 캐릭터는 망토·모자·가면을 뺀다 */
const HIDE_UNLESS_KNIGHT = ['Cape', 'Hat', 'Helmet', 'Mask'];

function hiddenPart(id: CharacterId, meshName: string): boolean {
  if (HIDE_ALWAYS.some((h) => meshName.includes(h))) return true;
  return id !== 'Knight' && HIDE_UNLESS_KNIGHT.some((h) => meshName.includes(h));
}

/** 캐릭터 모델 복제본 (여러 명이 같은 모델을 써도 뼈대가 따로 움직이도록) */
export function useCharacterModel(id: CharacterId): Object3D {
  const gltf = useLoader(GLTFLoader, characterUrl(id));
  return useMemo(() => {
    const root = cloneSkinned(gltf.scene);
    root.traverse((o) => {
      o.castShadow = true;
      if (hiddenPart(id, o.name)) o.visible = false;
    });
    return root;
  }, [gltf, id]);
}

for (const url of [...ANIM_FILES, ...CHARACTERS.map(characterUrl)]) useLoader.preload(GLTFLoader, url);
