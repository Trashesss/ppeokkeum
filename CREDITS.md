# 에셋 출처

| 에셋 | 제작 | 라이선스 | 출처 | 사용 위치 |
|---|---|---|---|---|
| KayKit Character Pack: Adventurers 2.0 (무료판) | Kay Lousberg (www.kaylousberg.com) | CC0 1.0 | https://kaylousberg.itch.io/kaykit-adventurers | `apps/client/public/models/characters/` |
| KayKit Character Animations 1.1 (무료판, Rig_Medium) | Kay Lousberg (www.kaylousberg.com) | CC0 1.0 | https://kaylousberg.itch.io/kaykit-character-animations | `apps/client/public/models/anims/` |

CC0 라 출처 표기 의무는 없지만, 제작자 요청에 따라 기록해 둔다.

그 밖의 3D 모델(지형·소품·물고기)과 소리는 코드로 생성한다.

## 캐릭터 에셋 다시 만들기

원본은 용량 때문에 git 에 넣지 않는다 (`assets-src/` 는 무시됨).

1. 위 두 페이지에서 무료판 zip 을 받아 압축을 푼다.
2. 아래 구조로 둔다.
   ```
   assets-src/kaykit/KayKit_Adventurers_2.0_FREE/Characters/gltf/*.glb
   assets-src/kaykit/KayKit_Character_Animations_1.1/Animations/gltf/Rig_Medium/*.glb
   ```
3. `npm run assets:characters` — 쓰는 클립만 남겨 `apps/client/public/models/` 에 만든다.
