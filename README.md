# 뻐끔뻐끔

여러 사람이 함께 머무는 저폴리 3D 낚시 힐링 광장. 요구사항은 [docs/requirements.md](docs/requirements.md).

현재 **0단계: 혼자 플레이 프로토타입**.

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # shared 판정 로직 테스트
npm run typecheck
npm run build
```

개발용 URL 옵션
- `?time=0.5`: 게임 시각 고정 시작 (0=자정, 0.5=정오, 0.9=밤)
- `?fast`: 입질 대기 1~2초
- `?showcase=fish&all`: 물고기 12종 비교 화면 (`&ids=crucian,carp`, `&yaw=0.5`, `&spin`, `&flop=0.15`)
- `?showcase=character&clip=Fishing_Cast&t=0.4`: 캐릭터·애니메이션 클립 확인 (`&chars=Ranger,Mage`, `&ts=0.1,0.3,0.5` 시점별 나열)

## 구조

```
packages/shared   맵·물 판정, 물고기 출현표, 입질·미니게임 규칙 (순수 TS, 1단계 서버와 공유)
apps/client       Vite + React Three Fiber 클라이언트
  src/game        입력(행동 단위), 낚시 상태 머신, 프로필(도감) 저장, 오디오 합성
  src/scene       지형·물·소품·환경광·아바타·낚시 연출·입자
  src/scene/fish  물고기 체형 명세(shapes.ts) → 저폴리 메시 생성기 + 파닥임 셰이더
  src/scene/Avatar.tsx  KayKit 캐릭터 + 상·하체 레이어 애니메이션, 손 소켓에 낚싯대·물고기
tools             에셋 변환 스크립트 (npm run assets:characters)
  src/ui          시작 화면, HUD, 들고 있는 물고기 카드, 도감
```

에셋 출처와 재생성 방법은 [CREDITS.md](CREDITS.md).

## 조작

- 이동: WASD · Shift 달리기 · Space 점프 · 드래그 시점 · 휠 확대
- 낚시: Q 길게 눌러 던지기 → 입질 때 Q → 누르고 떼며 장력 조절 · Esc 낚싯대 거두기
- 잡은 뒤: Q 바구니에 넣기 · R 길게 눌러 던지기(물이면 놓아줌, 땅이면 파닥임) · F 자랑하기
- 기타: E 앉기 / 물고기 줍기 · B 도감
