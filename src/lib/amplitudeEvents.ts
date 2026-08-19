import * as amplitude from '@amplitude/unified';

/** Amplitude 이벤트명 상수 — docs/analytics-naming-convention.md 컨벤션을 따릅니다.
 * (Title Case + 공백, [명사] + [과거형 동사]) */
export const AMPLITUDE_EVENTS = {
  HOME_PAGE_VIEWED: 'Home Page Viewed',
  ROOM_CREATE_STARTED: 'Room Create Started',
  ROOM_CREATED: 'Room Created',
  ROOM_JOIN_STARTED: 'Room Join Started',
  ROOM_JOINED: 'Room Joined',
  ROOM_JOIN_FAILED: 'Room Join Failed',
  ROOM_DELETED: 'Room Deleted',
  ROOM_SCREEN_VIEWED: 'Room Screen Viewed',
  ROOM_SETTINGS_VIEWED: 'Room Settings Viewed',
  PHOTO_UPLOADED: 'Photo Uploaded',
  PHOTO_UPLOAD_FAILED: 'Photo Upload Failed',
  PHOTO_DOWNLOADED: 'Photo Downloaded',
  PHOTO_DOWNLOAD_FAILED: 'Photo Download Failed',
  PHOTO_DELETED: 'Photo Deleted',
  INVITE_LINK_COPIED: 'Invite Link Copied',
  INVITE_CODE_COPIED: 'Invite Code Copied',
} as const;

/** 유입 경로(?src=)를 유저 속성으로 한 번만 기록 — 이후 모든 차트를 채널별로 나눠 볼 수 있습니다.
 * setOnce라 재방문해도 최초 유입 경로가 유지됩니다(퍼스트 터치 어트리뷰션). */
export function identifyEntrySrc(src: string) {
  const identify = new amplitude.Identify();
  identify.setOnce('entry_src', src);
  amplitude.identify(identify);
}

/* ── 실행 환경 구분 ───────────────────────────────────────
 * 개발자가 만든 이벤트와 실제 사용자 이벤트가 한 프로젝트에 섞이면 지표가 거짓말을 합니다.
 * 모든 이벤트(오토캡처 포함)에 `environment` 속성을 붙여 차트에서 걸러냅니다. */

/** 판정 순서: VITE_APP_ENV 강제 지정 → vite dev 서버 → localhost·사설망 접속 → 그 외는 배포 환경 */
function detectEnv(): string {
  const forced = import.meta.env.VITE_APP_ENV;
  if (forced) return forced;
  if (import.meta.env.DEV) return 'development';
  const host = location.hostname;
  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.local') ||
    /^(10|127|192\.168)\./.test(host) || // 사설망 — `vite preview`를 폰에서 열어볼 때
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  return isLocal ? 'development' : 'production';
}

export const APP_ENV = detectEnv();

/* ── 내부 사용자(팀원) 표시 ────────────────────────────────
 * `environment`는 "어디서 띄운 앱이냐"만 구분합니다. 팀원이 배포된 사이트에 들어가
 * 테스트하면 실사용자와 똑같이 production으로 찍힙니다. 그래서 사람 쪽에도 표시를 답니다.
 *
 * 쓰는 법: 배포 주소 끝에 `?internal=1`을 붙여 한 번 들어오면(`https://…/?internal=1`)
 * 그 브라우저는 계속 내부 사용자로 남습니다. 해제는 `?internal=0`.
 * 링크를 공유해 팀원이 각자 자기 브라우저에서 한 번씩 열면 됩니다. */

const LS_INTERNAL = 'sssok.internal.v1';

/** 해시 라우트라 파라미터가 `?internal=1`(주소 끝)로도, `#/room?internal=1`로도 올 수 있습니다. */
function readParam(key: string): string | null {
  const search = new URLSearchParams(window.location.search).get(key);
  if (search !== null) return search;
  const hashQuery = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(hashQuery).get(key);
}

function detectInternal(): boolean {
  const flag = readParam('internal');
  if (flag === '1') localStorage.setItem(LS_INTERNAL, '1');
  if (flag === '0') localStorage.removeItem(LS_INTERNAL);
  // 로컬·사설망 접속은 표시하지 않아도 내부입니다
  return localStorage.getItem(LS_INTERNAL) === '1' || APP_ENV !== 'production';
}

/** 팀원(또는 개발 환경)의 이벤트인가. 차트에서 이 값 하나만 걸러도 실사용자만 남습니다. */
export const IS_INTERNAL = detectInternal();

/** 모든 이벤트에 environment·is_internal을 붙입니다.
 * initAll 전에 add해야 오토캡처 이벤트까지 덮습니다. */
export const environmentPlugin: amplitude.Types.EnrichmentPlugin = {
  name: 'app-environment',
  type: 'enrichment',
  execute: async (event) => {
    event.event_properties = {
      ...event.event_properties,
      environment: APP_ENV,
      is_internal: IS_INTERNAL,
    };
    return event;
  },
};

/** 유저 속성으로도 남깁니다 — 코호트(내부 사용자 제외)를 만들 때 씁니다. */
export function identifyEnvironment() {
  const identify = new amplitude.Identify();
  identify.set('environment', APP_ENV);
  identify.set('is_internal', IS_INTERNAL);
  amplitude.identify(identify);
  if (IS_INTERNAL) console.info('[analytics] 내부 사용자로 기록됩니다 (해제: ?internal=0)');
}
