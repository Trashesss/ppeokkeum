/**
 * KayKit 원본(assets-src/kaykit)에서 게임에 쓰는 파일만 골라 apps/client/public/models 로 만든다.
 * - 캐릭터 glb: 그대로 복사 (텍스처 내장)
 * - 애니메이션 glb: 쓰는 클립만 남기고 마네킹 메시·미사용 데이터 제거
 * 사용: node tools/build-character-assets.mjs
 */
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'assets-src/kaykit';
const OUT = 'apps/client/public/models';
const CHAR_DIR = join(SRC, 'KayKit_Adventurers_2.0_FREE/Characters/gltf');
const ANIM_DIR = join(SRC, 'KayKit_Character_Animations_1.1/Animations/gltf/Rig_Medium');

export const CHARACTERS = ['Ranger', 'Rogue', 'Rogue_Hooded', 'Barbarian', 'Knight', 'Mage'];

/** 파일별로 남길 클립 */
const KEEP = {
  General: ['Idle_A', 'PickUp', 'Throw', 'Interact'],
  MovementBasic: ['Walking_A', 'Running_A'],
  Simulation: ['Cheering', 'Waving', 'Sit_Chair_Down', 'Sit_Chair_Idle', 'Sit_Chair_StandUp'],
  Tools: ['Fishing_Cast', 'Fishing_Idle', 'Fishing_Bite', 'Fishing_Reeling', 'Fishing_Struggling', 'Fishing_Tug', 'Fishing_Catch', 'Holding_A', 'Holding_B', 'Holding_C'],
};

mkdirSync(join(OUT, 'characters'), { recursive: true });
mkdirSync(join(OUT, 'anims'), { recursive: true });

for (const c of CHARACTERS) {
  copyFileSync(join(CHAR_DIR, `${c}.glb`), join(OUT, 'characters', `${c}.glb`));
}

const io = new NodeIO();
for (const [file, keep] of Object.entries(KEEP)) {
  const doc = await io.read(join(ANIM_DIR, `Rig_Medium_${file}.glb`));
  const root = doc.getRoot();
  const names = root.listAnimations().map((a) => a.getName());
  const missing = keep.filter((k) => !names.includes(k));
  if (missing.length) throw new Error(`${file}: 클립 없음 ${missing.join(', ')}`);
  for (const a of root.listAnimations()) if (!keep.includes(a.getName())) a.dispose();
  // 애니메이션 파일의 마네킹 메시는 쓰지 않는다 (뼈 이름으로만 캐릭터에 적용)
  for (const n of root.listNodes()) {
    n.setMesh(null);
    n.setSkin(null);
  }
  for (const m of root.listMeshes()) m.dispose();
  for (const s of root.listSkins()) s.dispose();
  await doc.transform(prune());
  const out = join(OUT, 'anims', `${file}.glb`);
  await io.write(out, doc);
  console.log(`${out}  ${(statSync(out).size / 1024).toFixed(0)}KB  [${keep.join(', ')}]`);
}
