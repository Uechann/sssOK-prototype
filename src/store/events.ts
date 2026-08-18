/** 계측 이벤트의 저장·조회 계층.
 *
 *   Firebase 모드 — sssok_events/{eventId} 에 한 건씩 append (수정·삭제 불가)
 *   로컬 모드   — localStorage 에 최근 것만 (개발 중에도 #/admin 이 그대로 동작합니다)
 *
 * 방 문서(sssok_rooms) 안에 넣지 않는 이유: 이미지가 base64로 문서에 들어가 있어 문서가 무겁고,
 * subscribeRoom 의 onSnapshot 이 이벤트 변경까지 전부 실시간으로 끌어오게 됩니다.
 */
import { collection, doc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore';
import { db, firebaseEnabled } from '../lib/firebase';
import type { TrackedEvent } from '../lib/analytics';

const EVENTS = 'sssok_events';
const LS_EVENTS = 'sssok.events.v1';
const LS_CAP = 3000;
const FETCH_LIMIT = 5000;

/* ── 쓰기 ─────────────────────────────────────────────── */

function writeLocal(event: TrackedEvent) {
  try {
    const raw = localStorage.getItem(LS_EVENTS);
    const list: TrackedEvent[] = raw ? JSON.parse(raw) : [];
    list.push(event);
    localStorage.setItem(LS_EVENTS, JSON.stringify(list.slice(-LS_CAP)));
  } catch {
    // 용량이 찼거나 JSON이 깨진 경우 — 계측 때문에 앱이 멈추면 안 됩니다
  }
}

/** 계측은 절대 앱을 막지 않습니다 — 실패해도 조용히 버립니다. */
export function recordEvent(event: TrackedEvent) {
  if (!firebaseEnabled) {
    writeLocal(event);
    return;
  }
  void setDoc(doc(db, EVENTS, event.id), event).catch(() => {
    writeLocal(event); // 오프라인 등으로 실패하면 최소한 이 기기에는 남깁니다
  });
}

/* ── 읽기 (#/admin 전용) ──────────────────────────────── */

function readLocal(): TrackedEvent[] {
  try {
    const raw = localStorage.getItem(LS_EVENTS);
    return raw ? (JSON.parse(raw) as TrackedEvent[]) : [];
  } catch {
    return [];
  }
}

export async function fetchEvents(): Promise<TrackedEvent[]> {
  if (!firebaseEnabled) return readLocal().sort((a, b) => a.ts - b.ts);
  const snap = await getDocs(
    query(collection(db, EVENTS), orderBy('ts', 'desc'), limit(FETCH_LIMIT)),
  );
  const remote = snap.docs.map((d) => d.data() as TrackedEvent);
  // 원격 쓰기가 실패해 로컬에만 남은 것도 함께 봅니다
  const seen = new Set(remote.map((e) => e.id));
  const merged = [...remote, ...readLocal().filter((e) => !seen.has(e.id))];
  return merged.sort((a, b) => a.ts - b.ts);
}

export function clearLocalEvents() {
  localStorage.removeItem(LS_EVENTS);
}
