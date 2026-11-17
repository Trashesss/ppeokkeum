# 1단계 구현 계획: 공개 광장 MVP

목표: 처음 들어온 사람이 닉네임만 넣고 광장에 들어와 다른 사람들과 함께 낚시하고, 도감이 서버에 남는 상태로 **공개 출시**한다.
범위는 [requirements.md](requirements.md) 5장의 1단계(A1–A3, B1–B3, C1–C4, D1–D7, E1–E4, F1–F6, G 데이터 구조).

## 1. 구조

```
apps/client  ──WebSocket──▶  apps/server (Colyseus, Node)
                                 ├─ PlazaRoom      채널 1개 = Room 1개 (최대 40명)
                                 ├─ HTTP /api      게스트 발급·복구 코드·도감 조회
                                 └─ PostgreSQL     플레이어·도감·어획·아이템·신고
packages/shared  (맵·출현표·판정 규칙. 클라이언트와 서버가 같은 코드를 쓴다)
```

- 프로세스 하나로 시작한다. 동접이 늘면 Redis presence/driver 를 붙여 프로세스를 늘린다 (코드 변경 없이 설정만).
- 친구 방(B4, 2단계)은 `PlazaRoom` 에 `private` 옵션과 초대코드만 추가한다. 지금부터 Room 이름을 `plaza` 하나로 두고 옵션으로 구분한다.

## 2. 무엇을 누가 판정하나

| 항목 | 판정 | 이유 |
|---|---|---|
| 이동 위치 | 클라이언트 → 서버가 검증 (속도 상한, `walkableHeight`) | 반응성이 중요, 순간이동만 막으면 됨 |
| 던질 수 있는지 (D1) | 서버 (`waterTypeAt`) | 물 밖 낚시 차단 |
| 입질 시각, 물고기 종·크기 | **서버** (`rollBiteDelay`, `rollCatch`) | 도감·기록이 남으므로 조작 차단 |
| 입질 반응 (D7) | 서버 (실제 시간으로 `isValidReaction`) | 너무 빠른 반응 차단 |
| 끌어올리기 미니게임 | 클라이언트가 진행, 서버는 **소요 시간만 검증** (`reelDuration` 의 0.8배 이상) | 매 프레임 입력을 서버로 보내지 않기 위해. 실패해도 페널티가 없어 조작 이득이 작다 |
| 도감·어획 기록 | 서버가 DB 에 기록 | E1 |

낚시 메시지 흐름:

```
client: cast {power}            server: 위치·방향으로 착수점 계산, 물 아니면 거절
                                server: 입질 예약 (biteAt)
server: bite {}                 ← 이때 종·크기 결정, 클라이언트엔 아직 비공개
client: hook {}                 server: 반응 시간 검증 → reel 시작 시각 기록
client: reelResult {caught}     server: 소요 시간 검증 → 성공이면 종·크기 공개, DB 기록, 희귀 이상은 채널 방송
client: keep / release / throw  server: 상태 반영 (들기·던지기는 모두에게 보임)
```

## 3. 동기화 상태 (Colyseus Schema)

```ts
PlazaState {
  players: MapSchema<PlayerState>
  groundFish: MapSchema<GroundFishState>   // 땅에 떨어져 파닥이는 물고기
  board: ArraySchema<BoardEntry>            // 오늘의 어획 Top 10 (E2)
}
PlayerState {
  nick, character, x, y, z, yaw, speed, jump,
  pose, seat?, hasRod, rodBend,             // 아바타가 그대로 읽는 값 (AvatarState)
  bobber?: { x, z, phase },                 // 남의 찌·낚싯줄 표시
  held?: { speciesId, sizeCm, tier },
}
```

- 서버 틱 20Hz, 클라이언트는 남의 캐릭터를 100ms 뒤로 보간한다 (C1: 200ms 지연에서도 부드럽게).
- 가까운 사람만 고빈도로 보낸다 (`StateView`, 반경 30m). 먼 사람은 위치만 1Hz.
- 아바타는 이미 `AvatarState` 객체만 읽도록 만들어 두어서, 남의 플레이어도 같은 컴포넌트로 그린다.
  `poseTime`·`jumpTime` 같은 경과 시간은 보내지 않고, 받는 쪽이 값이 바뀐 순간부터 직접 센다.

## 4. 데이터 (PostgreSQL)

```
players       (id, guest_token_hash, recovery_code_hash, nick, character, created_at, banned_until)
dex           (player_id, species_id, count, best_cm, first_at)
catches       (id, player_id, species_id, size_cm, channel, created_at)   -- 오늘의 게시판·통계
items / owned_items / equipped   -- requirements G 그대로
reports       (id, reporter_id, target_id, chat_log jsonb, created_at, status)
```

- 게스트 토큰은 브라우저에 저장하고 서버엔 해시만 둔다. 복구 코드(A3)도 해시로.
- 지금 브라우저에 쌓인 도감은 첫 접속 때 서버로 한 번 올린다 (기존 플레이어 배려, 서버가 범위 검증).

## 5. 작업 순서

| # | 작업 | 끝났다는 기준 |
|---|---|---|
| 1 | `apps/server` 뼈대: Colyseus + `PlazaRoom`, shared 연결, 로컬 실행 스크립트 | `npm run dev` 로 클라이언트·서버 동시 실행, 두 탭이 같은 방에 들어감 |
| 2 | 이동 동기화 + 남의 아바타 표시 (보간·이름표) | 두 탭에서 서로 걷고 뛰고 점프하는 게 보임, 200ms 지연 시뮬레이션에서도 부드러움 |
| 3 | 낚시 서버 판정 이관 (2장 흐름) | 남의 캐스팅·찌·낚아올리기·들기·던지기가 보임, 물 밖 캐스팅·빠른 반응 거절 테스트 |
| 4 | 게스트 계정·DB·도감 서버 저장·복구 코드 | 브라우저 데이터를 지워도 복구 코드로 도감 복원 |
| 5 | 채널: 자동 배정·자동 생성·채널 목록·이동 | 41번째 접속자가 새 채널로 감 |
| 6 | 채팅·말풍선·필터·도배 방지·차단·신고 (F1–F5) | 금칙어 마스킹, 3초 제한, 차단하면 상대가 안 보임 |
| 7 | 관리 도구 (F6): 킥·정지, 신고 목록 | 정지된 토큰·IP 재접속 거절 |
| 8 | 오늘의 어획 게시판, 희귀 어획 방송, 보상 아이템 (E2·E4) | |
| 9 | 배포·모니터링·약관·개인정보처리방침 | 공개 URL 에서 40명 부하 테스트 통과 |

1–3 이 핵심 경로라 먼저 하고, 4–8 은 병렬로 나눌 수 있다.

## 6. 정해야 할 것

1. **서버·DB 호스팅**: 예) Fly.io(서버) + Neon/Supabase(Postgres), 또는 Colyseus Cloud. 웹소켓 장기 연결이 되는 곳이어야 한다 (Vercel 서버리스는 불가, 클라이언트 정적 배포에는 적합).
2. **브랜치 전략**: 지금은 `main` 하나. `develop` 을 두고 기능별 브랜치(`feat/…`)로 갈지.
3. **작업 단위 관리**: 5장의 작업을 GitHub 이슈로 만들지.
4. **기존 키 배치 확인**: 낚시 Q, 점프 Space 로 바뀐 상태를 1단계에서도 유지할지.
