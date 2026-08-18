/** #/admin 이 쓰는 집계 — 이벤트 배열 하나를 넣으면 화면에 필요한 모든 숫자가 나옵니다. */
import type { TrackedEvent } from '../lib/analytics';

export interface ScreenVisit {
  name: string;
  at: number;
  ms: number;
  /** screen_end 없이 세션이 끝남 = 이 화면에서 이탈 */
  abandoned: boolean;
  /** ping 으로 추정한 값 (정확한 체류가 아님) */
  estimated: boolean;
}

export interface Session {
  sid: string;
  did: string;
  start: number;
  end: number;
  /** 화면 체류시간의 합 — 백그라운드 시간은 빠져 있습니다 */
  activeMs: number;
  role: 'host' | 'guest' | 'anon';
  src: string;
  roomKey?: string;
  mode: 'firebase' | 'local';
  vw: number;
  dev: boolean;
  events: TrackedEvent[];
  visits: ScreenVisit[];
  /** 마지막으로 본 화면 (이탈 지점) */
  lastScreen?: string;
  /** 화면을 닫지 않고 떠났는지 */
  droppedOff: boolean;
  failCount: number;
  /** 이 기기의 몇 번째 방문인지 */
  visitIndex: number;
}

export interface FunnelStep {
  key: string;
  label: string;
  reached: number;
  /** 직전 단계 대비 통과율(%) */
  rate: number;
  /** 직전 단계에서 여기로 오지 못한 세션 수 */
  lost: number;
}

export interface ScreenStat {
  name: string;
  entries: number;
  medianMs: number;
  avgMs: number;
  totalMs: number;
  exits: number;
  /** 진입 대비 이탈 비율(%) */
  exitRate: number;
}

export interface CountedRow {
  label: string;
  count: number;
  detail?: string;
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/* ── 세션 조립 ────────────────────────────────────────── */

export function buildSessions(events: TrackedEvent[]): Session[] {
  const bySid = new Map<string, TrackedEvent[]>();
  for (const e of events) {
    const list = bySid.get(e.sid);
    if (list) list.push(e);
    else bySid.set(e.sid, [e]);
  }

  const sessions: Session[] = [];
  for (const [sid, raw] of bySid) {
    const list = [...raw].sort((a, b) => a.ts - b.ts);
    const first = list[0];
    const last = list[list.length - 1];

    // 화면 진입/이탈을 짝지어 체류시간을 만듭니다
    const visits: ScreenVisit[] = [];
    let open: { name: string; at: number; ping?: number } | null = null;
    for (const e of list) {
      if (e.kind === 'screen') {
        if (open) {
          visits.push({
            name: open.name,
            at: open.at,
            ms: open.ping ?? e.ts - open.at,
            abandoned: false,
            estimated: true,
          });
        }
        open = { name: e.name, at: e.ts };
      } else if (e.kind === 'ping' && open?.name === e.name) {
        open.ping = e.ms;
      } else if (e.kind === 'screen_end' && open?.name === e.name) {
        visits.push({
          name: open.name,
          at: open.at,
          ms: e.ms ?? 0,
          abandoned: false,
          estimated: false,
        });
        open = null;
      }
    }
    // 닫히지 않은 화면 = 탭을 그냥 닫은 것 → 여기가 이탈 지점입니다
    if (open) {
      visits.push({
        name: open.name,
        at: open.at,
        ms: open.ping ?? last.ts - open.at,
        abandoned: true,
        estimated: true,
      });
    }

    const roleEvent = list.find((e) => e.role !== 'anon');
    const created = list.some((e) => e.name === 'room_create');
    const withRoom = list.find((e) => e.roomKey);

    sessions.push({
      sid,
      did: first.did,
      start: first.ts,
      end: last.ts,
      activeMs: visits.reduce((sum, v) => sum + v.ms, 0),
      role: created ? 'host' : (roleEvent?.role ?? 'anon'),
      src: first.src ?? 'direct',
      roomKey: withRoom?.roomKey,
      mode: first.mode,
      vw: first.vw,
      dev: Boolean(first.dev),
      events: list,
      visits,
      lastScreen: visits[visits.length - 1]?.name,
      droppedOff: Boolean(open),
      failCount: list.filter((e) => e.kind === 'fail').length,
      visitIndex: 1,
    });
  }

  sessions.sort((a, b) => a.start - b.start);
  // 기기별 몇 번째 방문인지 — 재방문은 "반응이 좋았다"의 가장 단순한 신호입니다
  const seen = new Map<string, number>();
  for (const s of sessions) {
    const n = (seen.get(s.did) ?? 0) + 1;
    seen.set(s.did, n);
    s.visitIndex = n;
  }
  return sessions.reverse(); // 최신 순
}

/* ── 퍼널 ─────────────────────────────────────────────── */

type Matcher = (s: Session) => boolean;

const has = (s: Session, name: string) => s.events.some((e) => e.name === name);
const hasAny = (s: Session, names: string[]) => names.some((n) => has(s, n));

const HOST_STEPS: { key: string; label: string; match: Matcher }[] = [
  { key: 'start', label: '앱 진입', match: () => true },
  { key: 'onboarding', label: '온보딩 도달', match: (s) => has(s, 'onboarding') },
  { key: 'form', label: '방 만들기 폼 진입', match: (s) => has(s, 'room_create_form') },
  { key: 'created', label: '방 생성 완료', match: (s) => has(s, 'room_create') },
  { key: 'named', label: '이름 입력 완료', match: (s) => has(s, 'name_gate.submit') },
  { key: 'room', label: '방 화면 도달', match: (s) => has(s, 'room.gallery') },
  {
    key: 'invited',
    label: '초대 공유',
    match: (s) => hasAny(s, ['invite.copy_link', 'invite.copy_code', 'room.qr']),
  },
  {
    key: 'uploaded',
    label: '업로드 성공',
    match: (s) =>
      s.events.some((e) => e.name === 'upload.done' && Number(e.meta?.uploaded ?? 0) > 0),
  },
];

const GUEST_STEPS: { key: string; label: string; match: Matcher }[] = [
  { key: 'start', label: '링크·QR·코드 진입', match: () => true },
  {
    key: 'gate',
    label: '입장 확인 통과',
    match: (s) => hasAny(s, ['join.ok', 'name_gate', 'room.gallery']),
  },
  { key: 'nameGate', label: '이름 입력 화면 도달', match: (s) => has(s, 'name_gate') },
  { key: 'named', label: '이름 입력 완료', match: (s) => has(s, 'name_gate.submit') },
  { key: 'room', label: '방 화면 도달', match: (s) => has(s, 'room.gallery') },
  { key: 'viewed', label: '사진 자세히 보기', match: (s) => has(s, 'room.lightbox') },
  {
    key: 'downloaded',
    label: '다운로드 성공',
    match: (s) => s.events.some((e) => e.name === 'download.done'),
  },
];

function funnel(
  steps: { key: string; label: string; match: Matcher }[],
  sessions: Session[],
): FunnelStep[] {
  // 이름 입력은 이미 이름이 있는 사람에게는 뜨지 않는 등 건너뛸 수 있는 단계가 있습니다.
  // 그래서 "이 단계에 도달"이 아니라 "이 단계 또는 그 이후 단계에 도달"로 셉니다.
  // 이렇게 해야 퍼널이 뒤로 갈수록 줄어들고 통과율이 100%를 넘지 않습니다.
  const reachedAt = steps.map((step) => sessions.filter(step.match).length);
  for (let i = steps.length - 2; i >= 0; i -= 1) {
    const laterOrHere = sessions.filter((session) =>
      steps.slice(i).some((step) => step.match(session)),
    ).length;
    reachedAt[i] = laterOrHere;
  }

  let previous = sessions.length;
  return steps.map((step, i) => {
    const reached = reachedAt[i];
    const rate = i === 0 || previous === 0 ? 100 : Math.round((reached / previous) * 100);
    const lost = i === 0 ? 0 : Math.max(0, previous - reached);
    previous = reached;
    return { key: step.key, label: step.label, reached, rate, lost };
  });
}

/** 방을 만들려고 한 세션 = 호스트. 그 외는 전부 게스트로 봅니다.
 * 방에 끝내 못 들어온 사람도 게스트 퍼널에 남아야 어디서 막혔는지 보입니다. */
const isHostSession = (s: Session) =>
  s.role === 'host' || hasAny(s, ['room_create_form', 'room_create']);

export const hostFunnel = (sessions: Session[]) => funnel(HOST_STEPS, sessions.filter(isHostSession));

export const guestFunnel = (sessions: Session[]) =>
  funnel(
    GUEST_STEPS,
    sessions.filter((s) => !isHostSession(s)),
  );

/* ── 화면별 체류 ─────────────────────────────────────── */

export function screenStats(sessions: Session[]): ScreenStat[] {
  const map = new Map<string, { ms: number[]; exits: number }>();
  for (const s of sessions) {
    for (const v of s.visits) {
      const entry = map.get(v.name) ?? { ms: [], exits: 0 };
      entry.ms.push(v.ms);
      if (v.abandoned) entry.exits += 1;
      map.set(v.name, entry);
    }
  }
  return [...map.entries()]
    .map(([name, { ms, exits }]) => ({
      name,
      entries: ms.length,
      medianMs: median(ms),
      avgMs: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length),
      totalMs: ms.reduce((a, b) => a + b, 0),
      exits,
      exitRate: Math.round((exits / ms.length) * 100),
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

/* ── 실패 ─────────────────────────────────────────────── */

export function failures(sessions: Session[]): CountedRow[] {
  const map = new Map<string, { count: number; details: Map<string, number> }>();
  for (const s of sessions) {
    for (const e of s.events) {
      if (e.kind !== 'fail') continue;
      const entry = map.get(e.name) ?? { count: 0, details: new Map() };
      entry.count += 1;
      const detail = String(e.meta?.reason ?? '');
      if (detail) entry.details.set(detail, (entry.details.get(detail) ?? 0) + 1);
      map.set(e.name, entry);
    }
  }
  return [...map.entries()]
    .map(([label, { count, details }]) => ({
      label,
      count,
      detail: [...details.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([d, n]) => `${d} ${n}`)
        .join(' · '),
    }))
    .sort((a, b) => b.count - a.count);
}

/* ── 전송 ─────────────────────────────────────────────── */

export interface TransferSummary {
  downloads: number;
  downloadedFiles: number;
  byMode: CountedRow[];
  downloadFails: number;
  uploads: number;
  uploadedFiles: number;
  uploadFails: number;
  retries: number;
}

export function transfers(sessions: Session[]): TransferSummary {
  const byMode = new Map<string, number>();
  let downloads = 0;
  let downloadedFiles = 0;
  let downloadFails = 0;
  let uploads = 0;
  let uploadedFiles = 0;
  let uploadFails = 0;
  let retries = 0;

  for (const s of sessions) {
    for (const e of s.events) {
      if (e.name === 'download.done') {
        downloads += 1;
        downloadedFiles += Number(e.meta?.saved ?? 0);
        const mode = String(e.meta?.mode ?? 'each');
        byMode.set(mode, (byMode.get(mode) ?? 0) + 1);
      }
      if (e.kind === 'fail' && e.name.startsWith('download.')) downloadFails += 1;
      if (e.name === 'upload.done') {
        uploads += 1;
        uploadedFiles += Number(e.meta?.uploaded ?? 0);
      }
      if (e.kind === 'fail' && e.name.startsWith('upload.')) uploadFails += 1;
      if (e.name === 'upload.retry') retries += 1;
    }
  }

  const modeLabel: Record<string, string> = {
    each: '개별 저장',
    zip: 'zip 묶음',
    photos: '사진첩 저장',
  };
  return {
    downloads,
    downloadedFiles,
    downloadFails,
    uploads,
    uploadedFiles,
    uploadFails,
    retries,
    byMode: [...byMode.entries()]
      .map(([mode, count]) => ({ label: modeLabel[mode] ?? mode, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/* ── 유입 경로 ────────────────────────────────────────── */

export function sources(sessions: Session[]): CountedRow[] {
  const label: Record<string, string> = {
    link: '공유 링크',
    qr: 'QR 코드',
    direct: '직접 · 코드 입력',
  };
  const map = new Map<string, { total: number; reached: number }>();
  for (const s of sessions) {
    const entry = map.get(s.src) ?? { total: 0, reached: 0 };
    entry.total += 1;
    if (s.events.some((e) => e.name === 'room.gallery')) entry.reached += 1;
    map.set(s.src, entry);
  }
  return [...map.entries()]
    .map(([src, { total, reached }]) => ({
      label: label[src] ?? src,
      count: total,
      detail: `방 도달 ${reached}건 (${total ? Math.round((reached / total) * 100) : 0}%)`,
    }))
    .sort((a, b) => b.count - a.count);
}

/* ── 반응(행동 프록시) ───────────────────────────────── */

export interface Engagement {
  returningDevices: number;
  devices: number;
  medianActiveMs: number;
  lightboxRate: number;
  folderRate: number;
  repeatUploadRate: number;
}

export function engagement(sessions: Session[]): Engagement {
  const devices = new Set(sessions.map((s) => s.did));
  const returning = new Set(sessions.filter((s) => s.visitIndex > 1).map((s) => s.did));
  const inRoom = sessions.filter((s) => has(s, 'room.gallery'));
  const pct = (n: number) => (inRoom.length ? Math.round((n / inRoom.length) * 100) : 0);
  return {
    devices: devices.size,
    returningDevices: returning.size,
    medianActiveMs: median(sessions.map((s) => s.activeMs)),
    lightboxRate: pct(inRoom.filter((s) => has(s, 'room.lightbox')).length),
    folderRate: pct(inRoom.filter((s) => hasAny(s, ['room.folder', 'folder.create'])).length),
    repeatUploadRate: pct(
      inRoom.filter((s) => s.events.filter((e) => e.name === 'upload.done').length > 1).length,
    ),
  };
}

/* ── 발굴 — "하려다 못 한 것" ─────────────────────────
 * 성공한 동작이 아니라 기대가 빗나간 순간들을 모읍니다.
 * 다음에 무엇을 만들지는 대체로 이쪽에서 나옵니다. */

export interface DialogOutcome {
  dialog: string;
  opened: number;
  confirmed: number;
  dismissed: number;
  /** 열어놓고 그냥 닫은 비율(%) — 높을수록 "여기 원하는 게 없었다" */
  dismissRate: number;
  /** 닫으면서 다른 시트로 이어진 경우 */
  chained: string;
}

export interface RoomShape {
  rooms: number;
  medianPhotos: number;
  medianFolders: number;
  medianMembers: number;
  /** 멤버가 둘 이상인데 올린 사람은 하나뿐인 방의 비율(%) — 보기만 하는 사람들 */
  lurkerRoomRate: number;
  /** 끝까지 혼자였던 방의 비율(%) — 초대가 실패했다는 뜻 */
  soloRoomRate: number;
}

export interface SelectionSummary {
  episodes: number;
  medianPeak: number;
  byMethod: CountedRow[];
  byOutcome: CountedRow[];
  /** 고르기만 하고 아무것도 안 한 비율(%) */
  idleRate: number;
}

export interface Discovery {
  selection: SelectionSummary;
  dialogs: DialogOutcome[];
  deadClicks: CountedRow[];
  longPress: CountedRow[];
  rageClicks: CountedRow[];
  emptyScreens: ScreenStat[];
  shape: RoomShape;
  expiredCreate: number;
  expiredHome: number;
}

function countBy(sessions: Session[], name: string, key: string): CountedRow[] {
  const map = new Map<string, number>();
  for (const s of sessions) {
    for (const e of s.events) {
      if (e.name !== name) continue;
      const value = String(e.meta?.[key] ?? '(알 수 없음)');
      map.set(value, (map.get(value) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export function discovery(sessions: Session[]): Discovery {
  // 시트·모달의 확정 / 포기
  const dialogs = new Map<string, { confirmed: number; dismissed: number; to: Map<string, number> }>();
  const shapes = new Map<string, { photos: number; folders: number; members: number; uploaders: number }>();
  let expiredCreate = 0;
  let expiredHome = 0;

  for (const s of sessions) {
    for (const e of s.events) {
      if (e.name === 'dialog.confirmed' || e.name === 'dialog.dismissed') {
        const key = String(e.meta?.dialog ?? '(알 수 없음)');
        const entry = dialogs.get(key) ?? { confirmed: 0, dismissed: 0, to: new Map() };
        if (e.name === 'dialog.confirmed') entry.confirmed += 1;
        else {
          entry.dismissed += 1;
          const to = e.meta?.to ? String(e.meta.to) : '';
          if (to) entry.to.set(to, (entry.to.get(to) ?? 0) + 1);
        }
        dialogs.set(key, entry);
      }
      if (e.name === 'room.snapshot' && e.roomKey) {
        // 같은 방은 마지막(가장 큰) 모습으로 봅니다
        const prev = shapes.get(e.roomKey);
        const next = {
          photos: Number(e.meta?.photos ?? 0),
          folders: Number(e.meta?.folders ?? 0),
          members: Number(e.meta?.members ?? 0),
          uploaders: Number(e.meta?.uploaders ?? 0),
        };
        shapes.set(
          e.roomKey,
          prev && prev.photos > next.photos ? prev : next,
        );
      }
      if (e.name === 'expired.create') expiredCreate += 1;
      if (e.name === 'expired.home') expiredHome += 1;
    }
  }

  const rooms = [...shapes.values()];
  const withMembers = rooms.filter((r) => r.members >= 2);

  const picks = sessions.flatMap((s) => s.events.filter((e) => e.name === 'selection.end'));
  const idle = picks.filter((e) => {
    const outcome = String(e.meta?.outcome ?? '');
    return outcome === 'none' || outcome === 'left';
  }).length;

  const METHOD_LABEL: Record<string, string> = {
    single: '하나씩',
    range: 'Shift 범위',
    marquee: '드래그 영역',
    slide: '슬라이드(모바일)',
    all: '전체 선택',
  };
  const OUTCOME_LABEL: Record<string, string> = {
    download: '다운로드',
    delete: '삭제',
    move: '폴더 이동',
    switch: '폴더·필터를 바꿔서 풀림',
    none: '아무것도 안 함',
    left: '고른 채로 화면을 떠남',
  };
  const readable = (raw: string, map: Record<string, string>) =>
    raw
      .split('+')
      .map((k) => map[k] ?? k)
      .join(' + ');

  return {
    selection: {
      episodes: picks.length,
      medianPeak: median(picks.map((e) => Number(e.meta?.peak ?? 0))),
      idleRate: picks.length ? Math.round((idle / picks.length) * 100) : 0,
      byMethod: countBy(sessions, 'selection.end', 'methods').map((r) => ({
        ...r,
        label: readable(r.label, METHOD_LABEL),
      })),
      byOutcome: countBy(sessions, 'selection.end', 'outcome').map((r) => ({
        ...r,
        label: OUTCOME_LABEL[r.label] ?? r.label,
      })),
    },
    dialogs: [...dialogs.entries()]
      .map(([dialog, { confirmed, dismissed, to }]) => {
        const opened = confirmed + dismissed;
        return {
          dialog,
          opened,
          confirmed,
          dismissed,
          dismissRate: opened ? Math.round((dismissed / opened) * 100) : 0,
          chained: [...to.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => `${k} ${n}`)
            .join(' · '),
        };
      })
      .sort((a, b) => b.dismissed - a.dismissed || b.opened - a.opened),
    deadClicks: countBy(sessions, 'dead_click', 'on'),
    longPress: countBy(sessions, 'long_press', 'on'),
    rageClicks: countBy(sessions, 'rage_click', 'on'),
    emptyScreens: screenStats(sessions).filter((s) => s.name.endsWith('.empty')),
    shape: {
      rooms: rooms.length,
      medianPhotos: median(rooms.map((r) => r.photos)),
      medianFolders: median(rooms.map((r) => r.folders)),
      medianMembers: median(rooms.map((r) => r.members)),
      lurkerRoomRate: withMembers.length
        ? Math.round(
            (withMembers.filter((r) => r.uploaders <= 1).length / withMembers.length) * 100,
          )
        : 0,
      soloRoomRate: rooms.length
        ? Math.round((rooms.filter((r) => r.members <= 1).length / rooms.length) * 100)
        : 0,
    },
    expiredCreate,
    expiredHome,
  };
}
