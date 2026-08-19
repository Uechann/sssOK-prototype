# 쏙 sssOK — 프로토타입

**배포:** https://sssok-prototype.vercel.app
**레포:** https://github.com/Uechann/sssOK-prototype (private)

링크 하나로 사진·영상을 모으고, 정해진 시간이 지나면 쏙 사라지는 임시 공유방.
피그마 와이어프레임(`wireframes/`)의 화면들을 그대로 매칭해 구현한 **동작하는 프로토타입**입니다.

## 저장 방식 — 두 가지 모드

`.env.local`에 Firebase 설정값이 있는지에 따라 자동으로 갈립니다(`src/lib/firebase.ts`).

- **Firebase 모드** (값이 채워져 있을 때) — Firestore(`sssok_rooms` 컬렉션)에 방·폴더·멤버·**이미지**를
  저장합니다. `onSnapshot`으로 실시간 구독하므로 **다른 기기·다른 브라우저에서도** 같은 방이
  그대로 보입니다. 이미지는 Storage 없이 Firestore 문서 안에 base64로 바로 들어가서(share-drop과
  같은 방식) **Storage·CORS 설정 없이 바로 동작**합니다 — 1600px 이하·700KB 이하로 자동
  압축해 Firestore 문서 한도(1MiB)에 맞춥니다. 영상만 용량 때문에 Firebase Storage가 필요합니다
  (아래 "영상 업로드" 참고).
- **로컬 모드** (값이 비어 있을 때) — 메타데이터는 `localStorage`, 바이트는 `IndexedDB`에 두고
  탭 간 동기화는 `BroadcastChannel`로 흉내냅니다. 이 브라우저 안에서만 존재합니다.

## 실행

```bash
npm install
```

Firebase를 쓰려면 `.env.example`을 `.env.local`로 복사하고 값을 채우세요
(Firebase 콘솔 → 프로젝트 설정 → 내 앱 → SDK 설정). 비워두면 로컬 모드로 동작합니다.

```bash
npm run dev
```

로컬 모드에서는 `http://localhost:5173`에 데모 방(`제주도 3박 4일`, 코드 `7K93QX2S`)이 미리 채워져 있습니다.
Firebase 모드에서는 빈 온보딩 화면에서 시작합니다(방을 직접 만들어야 해요).

### Firebase 프로젝트 준비 (한 번만)

**필수 — Firestore 규칙.** 이것만 하면 방 만들기·폴더·**이미지 업로드**까지 전부 됩니다.

- Firebase 콘솔 → Firestore Database → 규칙 탭에 [`firestore.rules`](firestore.rules) 내용을 붙여넣고 게시
- share-drop과 같은 프로젝트를 재사용하는 경우, 이 파일은 share-drop의 기존 규칙에
  `sssok_rooms` 블록만 추가된 형태라 그대로 덮어써도 share-drop 쪽 규칙은 유지됩니다

**선택 — 영상 업로드를 쓰려면.** 영상은 Firestore 문서(1MiB 한도)에 담기엔 너무 커서 Storage가
필요합니다. 이 단계를 건너뛰면 이미지는 정상 동작하고, 영상만 업로드 실패로 뜹니다.

1. Firebase 콘솔 → **Storage** → "시작하기"로 기본 버킷 생성 (이 프로젝트에서 Storage를 처음 쓴다면 필요)
2. Storage → 규칙 탭에 [`storage.rules`](storage.rules) 붙여넣고 게시
3. 버킷 CORS 설정 (브라우저에서 곧장 Storage로 업로드하기 때문에 필요) — 이 저장소의
   [`cors.json`](cors.json)을 그대로 쓰면 됩니다.
   - [Google Cloud Console → Cloud Storage → 버킷](https://console.cloud.google.com/storage/browser) 에서
     해당 버킷을 열고 "구성" 탭 → CORS 편집으로 `cors.json` 내용을 붙여넣거나,
   - `gcloud`/`gsutil`이 설치돼 있다면:
     ```bash
     gcloud storage buckets update gs://<버킷 이름> --cors-file=cors.json
     # 또는 구버전 CLI: gsutil cors set cors.json gs://<버킷 이름>
     ```

실제로 겪은 문제와 해결 과정은 [`troubleshooting/`](troubleshooting/)에 정리해뒀습니다.

## 확인해보면 좋은 것들

**실시간 동기화** — 같은 방 URL을 탭 두 개로 열고 한쪽에서 업로드하면 다른 쪽에 바로 나타납니다.

**웹 vs 모바일 인터랙션** — 창을 768px 이상으로 넓히면 갤러리가 2 → 5열로 늘어나고
클릭 선택 · Shift 범위 선택 · 드래그 영역 선택 · 더블클릭 자세히 보기로 바뀝니다.
좁히면 탭 = 자세히 보기, 체크 원 = 선택, 슬라이드 선택으로 전환됩니다.

**계측 대시보드** — `#/admin` 으로 들어가면 사용자가 어느 화면에 얼마나 머물렀고,
어디서 이탈했고, 무엇이 실패했고, 다운로드를 몇 번 했는지 볼 수 있습니다.
사용자 동선에는 없는 개발자용 화면입니다 (아래 "계측과 대시보드" 참고).

**프로토타입 시나리오** — 방 화면 왼쪽 아래 `시나리오` 칩을 누르면
업로드/다운로드 실패, 만료 임박, 즉시 만료를 강제로 만들 수 있습니다.
실패·만료 화면을 실제 조건 없이 확인하기 위한 프로토타입 전용 장치입니다.

## 계측과 대시보드

유저 테스트 회고용으로, 앱 곳곳에 "이 일이 일어났다"는 기록(이벤트)을 남기고
`#/admin` 에서 모아 봅니다. 대시보드는 다음을 보여줍니다.

- **호스트 · 게스트 퍼널** — 방을 만든 사람과 링크로 들어온 사람은 경로가 달라서 따로 그립니다
- **화면별 체류시간 · 이탈** — 라우트가 아니라 갤러리 · 자세히 보기 · QR 모달처럼
  방 안까지 쪼갠 단위입니다. 사용자 시간의 대부분이 방 화면 하나에서 흐르기 때문입니다
- **실패한 지점** — 코드 오류 · 암호 불일치 · 만료 · 업로드 실패(파일별 사유) · 다운로드 실패
- **유입 경로별 방 도달** — 공유 링크 · QR · 직접 입력. 초대 URL의 `?src=` 로 구분합니다
- **반응(행동으로 추정)** — 자세히 보기 진입률 · 폴더 사용률 · 재업로드 · 재방문
- **세션 타임라인** — 한 사람의 여정을 순서대로. n이 작을 때는 퍼센트보다 이쪽이 유용합니다
- **발굴 — 하려다 못 한 것** — 다음에 만들 기능을 찾는 자리입니다
  - *열었다가 그냥 닫은 시트·모달* — 확정과 포기를 나눠 셉니다. 포기율이 높은 시트는
    "여기 원하는 게 없었다"는 뜻입니다 (다운로드 옵션, 넣을 폴더가 없음 등)
  - *아무 일도 안 일어난 곳을 누름 · 길게 누름 · 연타* — "여기 뭐가 있을 줄 알았다"의
    직접 증거입니다. 눌린 요소의 class 이름만 남기고 텍스트·좌표는 남기지 않습니다
  - *고르는 방식 · 고르고 나서 한 것* — 하나씩/Shift 범위/드래그 영역/슬라이드/전체 중
    무엇으로 골랐고, 그 다음 다운로드·삭제·이동을 했는지. **고르기만 하고 아무것도 안 한 비율**이
    "고르긴 했는데 하고 싶은 게 없었다"는 신호입니다
  - *빈 화면에서 머문 시간* — 빈 방·빈 폴더·빈 필터 결과를 따로 셉니다.
    오래 머물다 나갔다면 그 화면이 막다른 길이라는 뜻입니다
  - *방이 실제로 쓰인 모습* — 방당 사진·폴더·멤버 수, 여럿인데 올린 사람은 하나뿐인 방 비율,
    끝까지 혼자였던 방 비율, 만료 후 `다시 만들기`를 누른 횟수(= 기간 연장 수요)

### 계측하면서 정한 것들

- **개인 식별 정보를 남기지 않습니다.** 닉네임 · 파일명 · 사진은 기록하지 않고 방 코드도
  해시로만 남깁니다. `#/admin` 은 해시 라우트라 서버에서 막을 수 없어 Firestore 규칙에서
  이벤트 `read` 를 열어야 하는데, 애초에 남길 게 없으면 URL이 새도 잃을 게 없습니다
  (`lib/analytics.ts` 의 `hashCode` 를 바꾸면 방 코드를 그대로 볼 수도 있습니다)
- **시나리오 칩으로 만든 가짜 실패**는 `scenario` 플래그를 달아 대시보드에서 기본으로
  걸러냅니다. 안 그러면 실패율이 거짓말을 합니다. localhost 접속도 같은 이유로 `dev` 플래그
- **화면 진입 · 이탈을 따로 남깁니다.** 탭을 그냥 닫으면 이탈 기록이 없으므로,
  짝이 없는 진입 기록이 곧 "여기서 이탈"입니다. 30초 heartbeat로 체류시간을 추정합니다
- 저장은 `sssok_events` 컬렉션에 한 건씩 (수정 · 삭제 불가). 방 문서 안에 넣으면 이미지가
  base64로 들어있는 무거운 문서를 `onSnapshot` 이 이벤트까지 실어 나르게 됩니다.
  로컬 모드에서는 `localStorage` 에 쌓여 개발 중에도 `#/admin` 이 그대로 동작합니다

Firebase 모드에서 쓰려면 [`firestore.rules`](firestore.rules) 를 다시 게시해야 합니다
(`sssok_events` 블록이 추가됐습니다).

## 화면 ↔ 시안 매칭

| 시안 | 구현 |
| --- | --- |
| 00 스플래시 / 01 온보딩 | `screens/Splash.tsx`, `screens/Onboarding.tsx` |
| 02 방 만들기 / 09 방 설정 변경 | `screens/RoomForm.tsx` (두 화면이 같은 폼) |
| 02 코드 입력 · 02a 코드 오류 | `screens/JoinByCode.tsx` |
| 02-1 이름 입력 모달 | `features/room/dialogs.tsx` → `NameSheet` |
| 02b 잘못된 링크 / 02c 방 만료 / 3f 오프라인 | `screens/Result.tsx` |
| 3 메인보드 · 04-1 빈 상태 | `features/room/RoomScreen.tsx`, `Gallery.tsx` |
| 05-1 선택 액션 바 · 07-1 진행 표시 · 3f-b 오프라인 배너 | `features/room/DockBars.tsx` |
| 06a·06b 라이트박스 | `features/room/Lightbox.tsx` |
| 06-1 다운로드 방식 · 11-1 폴더 추가 · 13-1 폴더 이동 · 14-1 QR | `features/room/dialogs.tsx` |
| 07d 용량 제한 · 07g 업로드 실패 · 10-1 방 삭제 · 12-1 폴더 삭제 | `features/room/dialogs.tsx` |
| 09-1 메뉴 팝오버 · 13-1 공유 팝오버 | `features/room/RoomScreen.tsx` |

## 마스코트 아트

`img/`의 원본 파일을 `src/assets/mascots.ts`에서 의미 있는 이름으로 매핑해 씁니다.
파일명은 피그마에서 내보낸 그대로 두었으니, 다시 내보내 덮어쓰기만 하면 됩니다.

| 파일 | 이름 | 쓰이는 곳 |
| --- | --- | --- |
| `image 71.png` | `wave` | 온보딩 |
| `image 1.png` | `photo` | 방 만들기 · 방 설정 변경 |
| `image 72.png` | `peek` | 빈 폴더, 스플래시 워드마크 |
| `image 70.png` | `waveWithPhoto` | 빈 메인보드 |
| `Group 29.png` | `cheer` | 드래그&드롭 안내 |
| `Group 30.png` | `sorted` | 다운로드 방식 선택 |
| `image 69.png` | `thumbsUp` | 폴더 이동 |
| `image 22.png` | `close` | 방 만료 |
| `image 16.png` | `trash` | 사진 삭제 확인 |
| `image 15.png` | `alert` | 방 삭제 확인 |
| `image 15 (1).png` | `sad` | 업로드 실패 |

**아직 아트가 없어 임시 SVG로 그린 포즈** — `folderX`(폴더 삭제 확인).
파일을 주시면 `mascots.ts`에 등록하고 `POSE_ART`에 한 줄만 추가하면 바로 교체됩니다.

## 기능 구현 메모

### 방

- **8자리 코드** — 혼동되는 `0/O`, `1/I`를 뺀 32자 알파벳(`lib/format.ts`)
- **QR** — 초대 URL을 `qrcode`로 인코딩. 카메라로 찍으면 그대로 방에 들어옵니다
- **만료** — 기본 24시간, 6/12/24 중 선택. 1시간 남으면 경고 토스트, 0이 되면 전체 화면 전환
- **입장 암호** — 선택 사항. 켜면 코드 입력 화면에 암호 필드가 함께 뜹니다
- **방 삭제** — 즉시 접근 차단 후 `deletedAt` 기록. 다음 실행 때 30일이 지난 방의 파일을 실제로 지웁니다(`store.tsx` → `purgeExpiredTrash`)
- **뒤로가기** — 해시 라우터라 브라우저 뒤로가기가 그대로 동작합니다

### 업로드

- 파일 선택 + 드래그&드롭, 개수 제한 없음, 이미지·영상 모두
- **자동 최적화** — 긴 변 1600px 리사이즈 후 JPEG 압축, 1.5MB를 넘으면 2차 압축.
  GIF는 애니메이션이 깨지므로 원본 유지 (`lib/media.ts`)
  - Firebase 모드의 이미지는 Storage 없이 Firestore 문서에 그대로 들어가기 때문에
    700KB(문서 한도 1MiB에 맞춘 값) 아래로 떨어질 때까지 해상도·화질을 단계적으로 더 낮춥니다
- **제한** — 이미지 30MB / 영상 1GB 초과 시 파일별 사유와 함께 안내
- **진행 연출** — 사진이 구멍으로 쏙 들어가는 애니메이션(`Hopper.tsx`).
  진행 바의 개수를 누르면 파일별 상태(대기 → 진행 → 완료/실패)가 펼쳐집니다
- **실패만 재시도** — 실패한 파일만 큐에 다시 넣습니다
- 업로드는 지금 보고 있는 폴더로 자동 분류됩니다

### 선택 · 다운로드

- 웹: 개별 / Shift 범위 / 드래그 영역 / 전체, 빈 공간 클릭 시 해제 (`useSelection.ts`)
- 모바일: 개별 / 슬라이드 선택 / 전체, 선택 개수 실시간 표시
- 다운로드: 개별 저장 · `.zip` 일괄(JSZip, 원본 파일명 유지, 중복은 `(1)` 부여).
  모바일에서 공유 시트를 지원하면 **사진첩에 저장** 항목이 함께 뜹니다
- 삭제 권한: 본인 업로드는 본인, 방장은 전체

### 보기 · 정리

- 갤러리 2~5열 반응형, 30개씩 점진 렌더링(IntersectionObserver)
- 업로더 배지 — 내 사진은 주황 `나`, 남의 사진은 흰 칩에 이름
- 자세히 보기 — PC는 방향키·ESC·화살표 버튼, 모바일은 좌우 스와이프·아래로 내려 닫기.
  햄버거 버튼으로 파일명·크기·원본 용량·위치 등 상세 정보
- 폴더 — 원클릭 생성, 폴더별 개수 표시, 선택 항목 이동 / 새 폴더 만들어 이동 / 꺼내기.
  사진 하나가 여러 폴더에 함께 담길 수 있습니다

## 구조

```
img/                   마스코트 아트 원본 (피그마 내보내기 그대로)
wireframes/            피그마 와이어프레임 시안 61장
firestore.rules        Firestore 보안 규칙 (share-drop 규칙 + sssok_rooms 블록)
storage.rules          Storage 보안 규칙
cors.json              Storage 버킷 CORS 설정 (브라우저 업로드에 필요)
src/
  App.tsx              라우팅 · 화면 전환 · 닉네임 게이트 · 방 구독 연결
  assets/mascots.ts    img/ 파일을 의미 있는 이름으로 매핑
  lib/firebase.ts       Firebase 초기화, 익명 인증, firebaseEnabled 플래그
  lib/analytics.ts      계측 — 화면 체류 · 이탈 · 실패 · 동작 기록
  store/events.ts       이벤트 저장/조회 (Firestore sssok_events · 로컬 폴백)
  screens/Admin.tsx     #/admin 계측 대시보드 (adminStats.ts 가 집계)
  store/store.tsx       상태 + 로컬 저장(localStorage·IndexedDB·BroadcastChannel)
  store/remote.ts        Firestore·Storage 읽기/쓰기 (Firebase 모드 전용)
  lib/                  라우터 · 포맷 · 미디어 최적화 · IndexedDB · 시드 데이터
  components/           디자인 시스템(버튼·시트·모달·팝오버·토스트), 아이콘, 마스코트
  screens/              스플래시 · 온보딩 · 방 만들기/설정 · 코드 입장 · 결과 화면
  features/room/        방 화면과 갤러리 · 선택 · 업로드 · 다운로드 · 라이트박스 · 다이얼로그
  styles/                디자인 토큰(시안 PNG에서 추출한 색상값)과 전역 스타일
```

## 프로토타입이라 진짜가 아닌 부분

- **로컬 모드**(Firebase 미설정)일 때만 해당 — 방이 이 브라우저 안에만 존재해 다른 기기에서
  코드를 입력해도 열리지 않습니다. Firebase 모드는 실제로 어디서든 열립니다.
- 계측 이벤트는 누구나 읽을 수 있습니다(`#/admin` 주소만 알면). 개인 식별 정보를 담지 않는
  것으로 맞바꾼 선택이라, 실제 서비스라면 서버 라우트나 관리자 인증 뒤로 옮겨야 합니다.
- 입장 암호는 평문 비교입니다. 지금 Firestore/Storage 규칙도 코드만 알면 누구나 읽고 쓸 수
  있게 완전히 열어뒀습니다(프로토타입이라 익명 인증 uid 기반 소유권 검증은 생략 — share-drop의
  `firestore.rules`처럼 강화할 수 있습니다)
- 영상은 재인코딩하지 않고 썸네일만 뽑습니다
- 방 삭제 30일 뒤 영구 삭제는 로컬 모드에서만 자동 실행됩니다(`purgeExpiredTrash`).
  Firebase 모드는 소프트 삭제(`deletedAt`)까지만 하고, 실제 파일 정리는 Cloud Functions 같은
  서버 측 예약 작업이 있어야 합니다(이 프로토타입엔 없습니다)
- Firebase 모드에서 영상 업로드는 실제 `uploadBytesResumable` 진행률입니다(Storage 설정이 안 돼
  있으면 실패). 이미지는 Firestore 문서 쓰기 한 번이라 진행률이 짧게 지나갑니다. 로컬 모드는
  둘 다 연출입니다. 다운로드/실패 연출도 모든 모드에서 시뮬레이션입니다
- 이미지를 Firestore 문서 안에 base64로 직접 저장하다 보니, 사진이 아주 많이 쌓인 방은
  스크롤할 때 다른 방식보다 데이터가 더 오갑니다. 프로토타입 규모에선 체감되지 않습니다
