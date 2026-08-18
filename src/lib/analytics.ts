/** 개발자용 계측 — 어디서 이탈했고, 어디에 얼마나 머물렀고, 무엇이 실패했는지 남깁니다.
 *
 * 원칙
 *  - 개인 식별 정보를 남기지 않습니다. 닉네임·파일명·사진은 기록하지 않고,
 *    방 코드는 해시(`roomKey`)로만 남겨 그룹만 지을 수 있게 합니다.
 *    `#/admin`은 해시 라우트라 서버에서 막을 수 없어, 규칙에서 read를 열어야 하기 때문입니다.
 *  - 시나리오 칩으로 강제한 가짜 실패(`scenario`)와 localhost 접속(`dev`)은
 *    플래그를 달아 대시보드에서 걸러냅니다. 안 그러면 실패율이 거짓말을 합니다.
 *  - 화면은 `screen`(진입) / `screen_end`(체류시간과 함께 이탈) 두 개로 남깁니다.
 *    탭을 그냥 닫으면 `screen_end`가 없으므로, 짝이 없는 `screen`이 곧 "여기서 이탈"입니다.
 */
import { uid } from './format';
import { firebaseEnabled } from './firebase';

export type EventKind = 'screen' | 'screen_end' | 'action' | 'fail' | 'ping';

export interface TrackedEvent {
  id: string;
  /** 탭 하나 = 세션 하나 */
  sid: string;
  /** 브라우저(기기) — 재방문을 세는 단위 */
  did: string;
  ts: number;
  kind: EventKind;
  /** 'room.gallery' · 'join.code_not_found' · 'download' 처럼 점으로 구분한 이름 */
  name: string;
  /** 화면 체류시간(ms) — screen_end·ping에만 */
  ms?: number;
  role: 'host' | 'guest' | 'anon';
  /** 방 코드 해시 — 원본 코드는 남기지 않습니다 */
  roomKey?: string;
  /** 유입 경로 */
  src?: string;
  meta?: Record<string, string | number | boolean>;
  /** 시나리오 칩으로 만든 가짜 실패 */
  scenario?: boolean;
  /** localhost·개발 서버에서 발생 */
  dev?: boolean;
  mode: 'firebase' | 'local';
  /** 뷰포트 너비 — 모바일/데스크톱 구분 */
  vw: number;
}

/** 눌렀을 때 뭔가 일어나는 곳들. 여기 밖을 누른 건 "헛클릭"으로 봅니다.
 * `.tile`·`.gallery`·`.overlay`는 버튼이 아니지만 각자 핸들러가 있어서 제외합니다. */
const CLICKABLE =
  'button, a, input, textarea, select, label, [role="button"], [role="menuitem"], ' +
  '.tile, .gallery, .overlay, .lightbox, .name-gate__backdrop';

const RAGE_WINDOW_MS = 1200;
const RAGE_RADIUS_PX = 40;
const LONG_PRESS_MS = 600;

const LS_DEVICE = 'sssok.device.v1'; // store.tsx와 같은 키를 씁니다
const SS_SESSION = 'sssok.sid.v1';
const HEARTBEAT_MS = 30_000;

type Sink = (event: TrackedEvent) => void;

let sink: Sink = () => {};
let started = false;
let role: TrackedEvent['role'] = 'anon';
let roomKey: string | undefined;
let entrySrc: string | undefined;
let scenario = false;
/** 열려 있는 화면. `acc`는 지금까지 쌓인 체류시간, `at`은 마지막으로 다시 센 시각입니다.
 * 탭이 가려지면 시계만 멈추고 화면은 그대로 열어둡니다 — 끊었다 다시 열면
 * 짧은 방문이 잔뜩 생겨서 이탈 지점을 못 읽게 됩니다. */
let current: { name: string; at: number; acc: number } | null = null;
let paused = false;
let heartbeat: number | null = null;

function dwell(): number {
  if (!current) return 0;
  return current.acc + (paused ? 0 : Date.now() - current.at);
}

/** 방 코드를 되돌릴 수 없는 짧은 키로 — 같은 방을 묶어 보기 위한 용도입니다.
 * 코드 자체를 보고 싶다면 이 함수가 code를 그대로 반환하게 바꾸면 됩니다. */
function hashCode(code: string): string {
  let h = 5381;
  for (let i = 0; i < code.length; i += 1) h = ((h << 5) + h + code.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function deviceId(): string {
  let id = localStorage.getItem(LS_DEVICE);
  if (!id) {
    id = uid('u_');
    localStorage.setItem(LS_DEVICE, id);
  }
  return id;
}

function sessionId(): string {
  let id = sessionStorage.getItem(SS_SESSION);
  if (!id) {
    id = uid('s_');
    sessionStorage.setItem(SS_SESSION, id);
  }
  return id;
}

const isDev = () =>
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.hostname.endsWith('.local');

/** 초대 링크·QR에 붙은 ?src= 를 읽습니다. 없으면 direct. */
function readSrc(): string {
  const query = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(query).get('src') ?? 'direct';
}

/** 눌린 요소를 class 이름으로만 표현합니다 — 텍스트나 입력값은 남기지 않습니다. */
function describe(el: Element): string {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 3; depth += 1) {
    const raw = typeof node.className === 'string' ? node.className.trim() : '';
    const first = raw.split(/\s+/)[0];
    if (first) return first;
    node = node.parentElement;
  }
  return el.tagName.toLowerCase();
}

function emit(
  kind: EventKind,
  name: string,
  extra?: Partial<Pick<TrackedEvent, 'ms' | 'meta'>>,
) {
  const event: TrackedEvent = {
    id: uid('e_'),
    sid: sessionId(),
    did: deviceId(),
    ts: Date.now(),
    kind,
    name,
    role,
    mode: firebaseEnabled ? 'firebase' : 'local',
    vw: window.innerWidth,
    ...(roomKey ? { roomKey } : {}),
    ...(entrySrc ? { src: entrySrc } : {}),
    ...(extra?.ms !== undefined ? { ms: extra.ms } : {}),
    ...(extra?.meta ? { meta: extra.meta } : {}),
    ...(scenario ? { scenario: true } : {}),
    ...(isDev() ? { dev: true } : {}),
  };
  sink(event);
}

/* ── 공개 API ─────────────────────────────────────────── */

/** 앱 시작 시 한 번. 이벤트를 어디에 쓸지(sink)는 store 쪽에서 주입합니다. */
export function startAnalytics(next: Sink) {
  sink = next;
  // 개발 중 HMR로 이 모듈이 다시 평가돼도 리스너가 겹치지 않도록 window에 표시를 남깁니다
  const flag = '__sssokAnalyticsStarted';
  if (started || (window as unknown as Record<string, boolean>)[flag]) return;
  (window as unknown as Record<string, boolean>)[flag] = true;
  started = true;
  entrySrc = readSrc();
  emit('action', 'session_start', {
    meta: { referrer: document.referrer ? new URL(document.referrer).host : 'none' },
  });

  // 탭을 감추면 체류를 끊고(백그라운드 시간은 세지 않습니다) 마지막 기록을 흘려보냅니다.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (current && !paused) {
        current.acc += Date.now() - current.at;
        paused = true;
      }
      stopHeartbeat();
    } else {
      if (current && paused) {
        current.at = Date.now();
        paused = false;
      }
      startHeartbeat();
    }
  });
  startHeartbeat();
  watchFrustration();
}

/** 사용자가 기대했지만 아무 일도 일어나지 않은 순간들을 모읍니다.
 * 없는 기능을 찾아내는 데는 성공한 동작보다 이쪽이 훨씬 많은 걸 알려줍니다. */
function watchFrustration() {
  let recent: { x: number; y: number; t: number }[] = [];
  /** 대시보드(#/admin)에서 우리가 누른 것은 사용자 신호가 아닙니다 */
  const onDashboard = () => window.location.hash.startsWith('#/admin');

  document.addEventListener(
    'click',
    (e) => {
      const target = e.target;
      if (!(target instanceof Element) || onDashboard()) return;
      const now = Date.now();

      // 같은 자리를 짧은 시간에 세 번 이상 — 뭔가 안 먹히고 있다는 신호
      recent = recent.filter((c) => now - c.t < RAGE_WINDOW_MS);
      recent.push({ x: e.clientX, y: e.clientY, t: now });
      if (
        recent.length >= 3 &&
        recent.every((c) => Math.hypot(c.x - e.clientX, c.y - e.clientY) < RAGE_RADIUS_PX)
      ) {
        emit('action', 'rage_click', { meta: { on: describe(target) } });
        recent = [];
      }

      if (!target.closest(CLICKABLE)) {
        emit('action', 'dead_click', { meta: { on: describe(target) } });
      }
    },
    true,
  );

  // 길게 누르기 — 사진을 꾹 눌러 메뉴를 기대하는 동작 같은 것
  let timer: number | null = null;
  let from: { x: number; y: number } | null = null;
  const clear = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    from = null;
  };

  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target;
      if (!(target instanceof Element) || onDashboard()) return;
      from = { x: e.clientX, y: e.clientY };
      timer = window.setTimeout(() => {
        emit('action', 'long_press', { meta: { on: describe(target) } });
        clear();
      }, LONG_PRESS_MS);
    },
    true,
  );
  document.addEventListener('pointerup', clear, true);
  document.addEventListener('pointercancel', clear, true);
  document.addEventListener(
    'pointermove',
    (e) => {
      if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 10) clear();
    },
    true,
  );
}

function startHeartbeat() {
  if (heartbeat !== null) return;
  heartbeat = window.setInterval(() => {
    if (!current || paused) return;
    // 짝 없는 screen(=이탈)의 체류시간을 30초 단위로 추정할 수 있게 남깁니다
    emit('ping', current.name, { ms: dwell() });
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeat === null) return;
  window.clearInterval(heartbeat);
  heartbeat = null;
}

export function setRole(next: TrackedEvent['role']) {
  role = next;
}

export function setRoom(code: string | null) {
  roomKey = code ? hashCode(code) : undefined;
}

/** 시나리오 칩 상태 — 여기서 만든 실패는 전부 가짜로 표시됩니다 */
export function setScenario(on: boolean) {
  scenario = on;
}

/** 화면 진입. 같은 이름을 다시 부르면 무시하고, 다른 화면이면 이전 화면을 닫습니다. */
export function screen(name: string) {
  if (current?.name === name) return;
  endScreen();
  current = { name, at: Date.now(), acc: 0 };
  paused = document.hidden;
  emit('screen', name);
}

/** 화면 이탈 — 체류시간과 함께 남깁니다 */
export function endScreen() {
  if (!current) return;
  emit('screen_end', current.name, { ms: dwell() });
  current = null;
  paused = false;
}

export function action(name: string, meta?: TrackedEvent['meta']) {
  emit('action', name, meta ? { meta } : undefined);
}

export function fail(name: string, meta?: TrackedEvent['meta']) {
  emit('fail', name, meta ? { meta } : undefined);
}
