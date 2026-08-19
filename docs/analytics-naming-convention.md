# Amplitude 이벤트 네이밍 컨벤션

- **목적:** 일관된 이벤트 스키마를 유지하고, 분석 및 협업 과정에서 혼동을 줄이기 위해 아래 네이밍 규칙을 따른다.

Amplitude는 프로젝트 전체에서 일관된 Naming Convention을 유지할 것을 권장한다.
https://amplitude.com/docs/data/amplitude-data-settings#naming-conventions

## 0. 한 줄 요약

| 구분 | 규칙 | 예시 |
| --- | --- | --- |
| 이벤트 | Title Case + 공백, `[명사] + [과거형 동사]` | `Conversation Started` |
| 이벤트 속성 | snake_case | `scenario_id` |
| 유저 속성 | snake_case (불리언은 `is_`/`has_`) | `is_premium` |

## 1. 케이스 & 시제 규칙

### 1-1. 이벤트 = Title Case + 공백, 명사 + 과거형 동사

```
Good: Conversation Started, Turn Completed, Feedback Viewed
Bad: start_conversation, conversationStarted, Start Conversation
```

**이유**

1. **Amplitude 기본 이벤트와 일관성 유지**

   Amplitude가 자동 수집하는 기본 이벤트가 Title Case를 쓴다.
   우리 이벤트도 같은 스타일이어야 대시보드에서 섞여도 일관된 형태로 관리하기 쉽다.

2. **가독성**

   분석할 때 `Conversation Started`가 `conversation_started`보다 훨씬 빠르게 읽힌다. 분석은 PM·디자이너도 본다.

3. **과거형**

   이벤트는 "행동이 **이미 일어난 뒤**" 발화된다.
   `Join`이면 가입 중인지 완료인지 모호하지만, `Joined`면 완료가 명확하다.

### 1-2. 속성 = snake_case

```
Good: scenario_id, turn_count, stt_mode
Bad: scenarioId, ScenarioID, scenario id
```

**이유**

1. **이벤트와 속성을 쉽게 구분**

   이벤트(Title Case)와 속성(snake_case)을 다른 스타일로 두면, 화면에서 "이건 이벤트, 이건 속성"이 한눈에 구분된다.

2. **Amplitude 공식 예시에서도 자주 사용하는 방식**

   객체 키 및 JSON 필드명으로 사용하기 자연스럽고, 백엔드(DB·Python·SQL 등)와의 네이밍 일관성을 유지하기 쉽다.

## 2. 핵심 원칙

### 2-1. 변형은 이벤트명이 아니라 속성으로

```
Good: Scenario Started + { level: "beginner", category: "business" }
Bad: Beginner Scenario Started, Business Scenario Started
```

**이유:** 이벤트를 변형마다 생성하면 이벤트 종류가 불필요하게 늘어나 관리와 분석이 어려워진다. 변형 정보는 속성으로 관리하여 하나의 이벤트를 다양한 기준으로 필터링하고 세그먼트 분석한다.

### 2-2. 이벤트명에 동적 값 금지

```
Good: Scenario Started + { scenario_id: 42 }
Bad: Scenario 42 Started, Turn 3 Completed
```

**이유**: ID, 인덱스 등 동적 값을 이벤트명에 포함하면 이벤트 종류가 무한히 증가해 동일한 행동을 하나의 이벤트로 분석하기 어렵다. 동적 값은 모두 속성으로 관리한다.

### 2-3. 사용자의 행동을 중심으로 정의한다

```
Good:
- 유저가 보낸 발화 → Turn Completed
- 시스템이 준 피드백을 유저가 본 것 → Feedback Viewed

Bad: Message Sent (유저가 보낸 건지 우리가 보낸 건지 모호)
```

**이유**: 이벤트는 사용자의 행동을 기준으로 정의하면 이름만 보아도 누가 수행한 행동인지 명확하며 퍼널과 사용자 여정을 이해하기 쉽다.

### 2-4. 입도(granularity): 의미 있는 행동만 추적

```
Good: 퍼널/리텐션 분석에 의미 있는 행동만
Bad: 모든 버튼 클릭을 개별 이벤트로
```

**이유**: 모든 클릭을 추적하면 노이즈가 증가해 핵심 사용자 행동을 파악하기 어려워진다. 분석 목적이 있는 의미 있는 행동부터 추적한다.

> **Q. 일단 다 수집해두면 좋지 않을까?**
> A. "일단 다 수집"보다는 "나중에 분석할 가능성이 있는 데이터는 미리 수집하되, 목적 없는 이벤트는 만들지 않는다"가 실무에서 가장 많이 사용하는 접근 방식이다.

### 2-5. PII(Personally Identifiable Information) 절대 금지

```
Bad: email, phone, message_text
Good: user_id, scenario_id
```

개인정보는 프라이버시 보호와 법적 컴플라이언스를 위해 이벤트에 직접 저장하지 않는다. 사용자 식별은 익명 user_id 또는 내부 식별자를 사용한다.

**이유**: 프라이버시·보안·법적 컴플라이언스. 한 번 들어간 PII는 회수가 어렵다.

## 3. 거버넌스 (운영 규칙)

### 3-1. 코드에서 이벤트명 하드코딩 금지 → 상수로 관리

모든 이벤트명·속성 키는 공유 모듈에 상수로 정의하고 앱 전체가 함께 사용한다.

```ts
// 예: src/lib/analyticsEvents.ts
export const EVENTS = {
  CONVERSATION_STARTED: 'Conversation Started',
  TURN_COMPLETED: 'Turn Completed',
  FEEDBACK_VIEWED: 'Feedback Viewed',
} as const;
```

**이유**

1. 문자열 오타와 케이싱 불일치를 방지한다.
2. 여러 플랫폼(web/RN 등)이 같은 상수를 import → 이벤트명이 절대 갈라지지 않는다.

### 3-2. Amplitude Data 설정에서 네이밍 컨벤션 강제

Amplitude Data의 Naming Convention을 설정하여 이벤트명이 팀 규칙을 따르는지 검증하고 관리한다.

### 3-3. 개발/운영 환경 구분 (`environment` 속성)

테스트 이벤트가 비즈니스 리포트를 더럽히지 않도록 환경을 구분한다.
프로젝트를 dev/prod로 나누는 것이 정석이지만, 현재는 프로젝트가 하나이므로
**모든 이벤트에 `environment` 속성을 붙여** 차트에서 걸러낸다.

- 값: `development` | `production` (필요하면 `VITE_APP_ENV`로 `staging` 등 지정)
- 판정: `VITE_APP_ENV` → vite dev 서버 → localhost·사설망 접속 → 그 외는 `production`
- 구현: `src/lib/amplitudeEvents.ts`의 `environmentPlugin`(enrichment 플러그인).
  `main.tsx`에서 `initAll` **전에** `amplitude.add()` 해야 오토캡처 이벤트까지 덮인다.
- 이벤트 속성과 유저 속성(`identifyEnvironment()`) 양쪽에 남긴다.
  이벤트 속성은 차트 필터용, 유저 속성은 "개발자 기기 제외" 코호트용이다.
- 세션 리플레이는 `production`에서만 녹화한다(무료 쿼터 보호).

### 3-3-1. 내부 사용자(팀원) 표시 (`is_internal` 속성)

`environment`는 "어디서 띄운 앱이냐"만 구분한다. 팀원이 배포된 사이트에서 테스트하면
실사용자와 똑같이 `production`으로 찍히므로, 사람 쪽에도 표시를 단다.

- 팀원은 배포 주소에 `?internal=1`을 붙여 브라우저마다 한 번씩 들어온다
  (`https://demo.ssssok.com/?internal=1`). localStorage에 남아 이후 계속 유지된다. 해제는 `?internal=0`.
- 개발 환경(`environment !== 'production'`)은 표시하지 않아도 `is_internal: true`다.
- 따라서 **차트에는 `is_internal`이 true가 아닌 것만** 남기면 실사용자만 보인다.

### 3-3-2. 과거 데이터(속성이 붙기 전) 걸러내기

- 커스텀 이벤트에도 오토캡처가 `[Amplitude] Page Domain`을 붙여준다(확인됨).
  → **`[Amplitude] Page Domain = demo.ssssok.com`** 필터만으로 로컬 개발 트래픽이 빠진다.
- 팀원이 배포 사이트에서 만든 과거 이벤트는 도메인으로 구분되지 않는다.
  localhost 접속 이력이 있는 유저(= 개발자 기기)를 코호트로 만들어 차트에서 제외한다.

### 3-4. 이벤트 변경 관리

이벤트명이나 속성 타입 변경은 기존 대시보드와 분석에 영향을 줄 수 있으므로, 변경 전 영향도를 검토하고 필요한 경우 기존 이벤트를 일정 기간 유지(Deprecated)한 뒤 제거한다.

## 4. 신규 이벤트 추가 체크리스트

- [ ] `[명사] + [과거형 동사]`, Title Case인가?
- [ ] 같은 행동을 이미 추적하는 이벤트가 있는가? (중복 금지)
- [ ] 변형은 속성으로 분리했는가?
- [ ] 동적 값이 이벤트명에 들어가지 않았는가?
- [ ] `~ Started` 류는 특정 버튼이 아니라 **화면 진입**에서 찍는가?
      (진입 경로가 여러 개면 버튼 한 곳에서만 찍었을 때 시작 < 완료가 됩니다)
- [ ] PII가 포함되지 않았는가?
- [ ] 공유 상수 모듈에 등록했는가?

## 참고자료

- https://amplitude.com/docs/data/data-planning-playbook
- https://amplitude.com/docs/data/amplitude-data-get-started
- https://amplitude.com/docs/data/amplitude-data-settings
- https://amplitude.com/blog/analytics-tracking-practices
