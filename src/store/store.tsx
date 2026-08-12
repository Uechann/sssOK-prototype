import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Folder, Photo, Room, Toast } from '../types';
import { uid } from '../lib/format';
import { blobStore } from '../lib/idb';
import { makeDemoRoom } from '../lib/seed';
import { ensureAnonymousUser, firebaseEnabled } from '../lib/firebase';
import {
  addFolderRemote,
  deleteFolderRemote,
  joinRoomRemote,
  moveToFolderRemote,
  patchRoomRemote,
  removePhotosRemote,
  renameFolderRemote,
  subscribeRoom,
} from './remote';

const LS_KEY = 'sssok.state.v1';
const LS_NAME = 'sssok.name.v1';
const LS_DEVICE = 'sssok.device.v1';
const CHANNEL = 'sssok.sync.v1';

export interface Me {
  id: string;
  name: string;
}

interface State {
  me: Me;
  rooms: Record<string, Room>;
  hydrated: boolean;
}

type Action =
  | { type: 'hydrate'; me: Me; rooms: Record<string, Room> }
  | { type: 'sync'; rooms: Record<string, Room> }
  | { type: 'syncRoom'; code: string; room: Room | null }
  | { type: 'setName'; name: string }
  | { type: 'upsertRoom'; room: Room }
  | { type: 'patchRoom'; code: string; patch: Partial<Room> }
  | { type: 'addPhotos'; code: string; photos: Photo[] }
  | { type: 'removePhotos'; code: string; ids: string[] }
  | { type: 'addFolder'; code: string; folder: Folder }
  | { type: 'renameFolder'; code: string; id: string; name: string }
  | { type: 'deleteFolder'; code: string; id: string }
  | { type: 'moveToFolder'; code: string; photoIds: string[]; folderId: string | null }
  | { type: 'joinRoom'; code: string; member: Me };

function withRoom(state: State, code: string, update: (room: Room) => Room): State {
  const room = state.rooms[code];
  if (!room) return state;
  return { ...state, rooms: { ...state.rooms, [code]: update(room) } };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return { me: action.me, rooms: action.rooms, hydrated: true };

    case 'sync':
      return { ...state, rooms: action.rooms };

    case 'syncRoom': {
      if (action.room === null) {
        if (!(action.code in state.rooms)) return state;
        const rooms = { ...state.rooms };
        delete rooms[action.code];
        return { ...state, rooms };
      }
      return { ...state, rooms: { ...state.rooms, [action.code]: action.room } };
    }

    case 'setName': {
      const me = { ...state.me, name: action.name };
      // 내가 참여 중인 방의 표시 이름도 함께 갱신 (로컬 모드 전용 — 원격 모드는 store.tsx 밖에서 처리)
      const rooms = Object.fromEntries(
        Object.entries(state.rooms).map(([code, room]) => [
          code,
          {
            ...room,
            hostName: room.hostId === me.id ? action.name : room.hostName,
            members: room.members.map((m) => (m.id === me.id ? { ...m, name: action.name } : m)),
            photos: room.photos.map((p) =>
              p.uploaderId === me.id ? { ...p, uploaderName: action.name } : p,
            ),
          },
        ]),
      );
      return { ...state, me, rooms };
    }

    case 'upsertRoom':
      return { ...state, rooms: { ...state.rooms, [action.room.code]: action.room } };

    case 'patchRoom':
      return withRoom(state, action.code, (room) => ({ ...room, ...action.patch }));

    case 'addPhotos':
      return withRoom(state, action.code, (room) => ({
        ...room,
        photos: [...action.photos, ...room.photos],
      }));

    case 'removePhotos': {
      const ids = new Set(action.ids);
      return withRoom(state, action.code, (room) => ({
        ...room,
        photos: room.photos.filter((p) => !ids.has(p.id)),
      }));
    }

    case 'addFolder':
      return withRoom(state, action.code, (room) => ({
        ...room,
        folders: [...room.folders, action.folder],
      }));

    case 'renameFolder':
      return withRoom(state, action.code, (room) => ({
        ...room,
        folders: room.folders.map((f) => (f.id === action.id ? { ...f, name: action.name } : f)),
      }));

    case 'deleteFolder':
      // 폴더만 삭제되고 사진은 그대로 유지됩니다
      return withRoom(state, action.code, (room) => ({
        ...room,
        folders: room.folders.filter((f) => f.id !== action.id),
        photos: room.photos.map((p) => ({
          ...p,
          folderIds: p.folderIds.filter((id) => id !== action.id),
        })),
      }));

    case 'moveToFolder': {
      const ids = new Set(action.photoIds);
      return withRoom(state, action.code, (room) => ({
        ...room,
        photos: room.photos.map((p) => {
          if (!ids.has(p.id)) return p;
          if (action.folderId === null) return { ...p, folderIds: [] }; // 꺼내기
          if (p.folderIds.includes(action.folderId)) return p;
          return { ...p, folderIds: [...p.folderIds, action.folderId] };
        }),
      }));
    }

    case 'joinRoom':
      return withRoom(state, action.code, (room) =>
        room.members.some((m) => m.id === action.member.id)
          ? room
          : { ...room, members: [...room.members, action.member] },
      );

    default:
      return state;
  }
}

/* ── 저장 / 복원 (로컬 모드 전용) ───────────────────────
 * 메타데이터는 localStorage, 업로드된 바이트는 IndexedDB.
 * blob: URL은 문서마다 달라서 저장하지 않고 매번 다시 만듭니다.
 * Firebase가 켜져 있으면 Firestore가 원본이라 이 저장 경로 자체를 타지 않습니다. */

function serialize(rooms: Record<string, Room>): string {
  const plain = Object.fromEntries(
    Object.entries(rooms).map(([code, room]) => [
      code,
      {
        ...room,
        photos: room.photos.map((p) => ({
          ...p,
          src: p.src.startsWith('data:') ? p.src : '',
          poster: p.poster.startsWith('data:') ? p.poster : '',
        })),
      },
    ]),
  );
  return JSON.stringify(plain);
}

async function rehydrate(rooms: Record<string, Room>): Promise<Record<string, Room>> {
  const entries = await Promise.all(
    Object.entries(rooms).map(async ([code, room]) => {
      const photos = await Promise.all(
        room.photos.map(async (p) => {
          if (p.src.startsWith('data:')) return p;
          const blob = await blobStore.get(p.id);
          if (!blob) return null; // 바이트가 사라진 항목은 버립니다
          const src = URL.createObjectURL(blob);
          return { ...p, src, poster: p.poster || src };
        }),
      );
      return [code, { ...room, photos: photos.filter((p): p is Photo => p !== null) }] as const;
    }),
  );
  return Object.fromEntries(entries);
}

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 삭제한 방은 30일 보관 후 영구 삭제

/** 보관 기한이 지난 방을 실제로 지웁니다 (내부 파일까지) — 로컬 모드 전용.
 * Firebase 모드에서는 클라이언트만으로 예약 삭제를 보장할 수 없어(아무도 접속 안 하면 실행 안 됨)
 * 소프트 삭제(deletedAt)까지만 하고, 실제 정리는 Cloud Functions 같은 서버 측 작업이 필요합니다. */
async function purgeExpiredTrash(rooms: Record<string, Room>): Promise<Record<string, Room>> {
  const cutoff = Date.now() - RETENTION_MS;
  const kept: Record<string, Room> = {};
  for (const [code, room] of Object.entries(rooms)) {
    if (room.deletedAt !== undefined && room.deletedAt < cutoff) {
      await Promise.all(room.photos.map((p) => blobStore.del(p.id)));
      continue;
    }
    kept[code] = room;
  }
  return kept;
}

function loadDeviceId(): string {
  let id = localStorage.getItem(LS_DEVICE);
  if (!id) {
    id = uid('u_');
    localStorage.setItem(LS_DEVICE, id);
  }
  return id;
}

/* ── Context ─────────────────────────────────────────── */

interface StoreValue extends State {
  dispatch: React.Dispatch<Action>;
  toasts: Toast[];
  toast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
  setName: (name: string) => void;
  /** 방 삭제 — 내부 파일까지 정리. 30일 보관 후 영구 삭제 정책을 시뮬레이션합니다. */
  deleteRoom: (code: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    me: { id: '', name: '' },
    rooms: {},
    hydrated: false,
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const channel = useRef<BroadcastChannel | null>(null);
  const applyingRemote = useRef(false);

  // 최초 복원
  useEffect(() => {
    let alive = true;
    (async () => {
      const name = localStorage.getItem(LS_NAME) ?? '';

      if (firebaseEnabled) {
        const uid = await ensureAnonymousUser();
        const id = uid ?? loadDeviceId();
        if (alive) dispatch({ type: 'hydrate', me: { id, name }, rooms: {} });
        return;
      }

      const id = loadDeviceId();
      const raw = localStorage.getItem(LS_KEY);
      let rooms: Record<string, Room> = {};
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { me?: Me; rooms?: Record<string, Room> };
          rooms = await rehydrate(await purgeExpiredTrash(parsed.rooms ?? {}));
        } catch {
          rooms = {};
        }
      }
      if (Object.keys(rooms).length === 0) {
        const demo = makeDemoRoom(id, name || '나');
        rooms[demo.code] = demo;
      }
      if (alive) dispatch({ type: 'hydrate', me: { id, name }, rooms });
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 저장 + 다른 탭으로 브로드캐스트 (로컬 모드의 "실시간 동기화")
  // Firebase 모드는 Firestore 구독이 이 역할을 대신합니다.
  useEffect(() => {
    if (!state.hydrated || firebaseEnabled) return;
    const payload = serialize(state.rooms);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ me: state.me, rooms: JSON.parse(payload) }));
    } catch {
      /* 용량 초과는 무시 — 바이트는 IndexedDB에 있습니다 */
    }
    if (applyingRemote.current) {
      applyingRemote.current = false;
      return;
    }
    channel.current?.postMessage({ from: state.me.id, rooms: payload });
  }, [state.rooms, state.me, state.hydrated]);

  // 다른 탭의 변경 수신 (로컬 모드 전용)
  useEffect(() => {
    if (firebaseEnabled || typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    ch.onmessage = async (event: MessageEvent<{ rooms: string }>) => {
      try {
        const incoming = await rehydrate(JSON.parse(event.data.rooms));
        applyingRemote.current = true;
        dispatch({ type: 'sync', rooms: incoming });
      } catch {
        /* 무시 */
      }
    };
    return () => {
      ch.close();
      channel.current = null;
    };
  }, []);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const item: Toast = { id: uid('t_'), message, tone };
    setToasts((prev) => [...prev.filter((t) => t.message !== message), item]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== item.id));
    }, 3400);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const setName = useCallback(
    (name: string) => {
      localStorage.setItem(LS_NAME, name);
      dispatch({ type: 'setName', name });
      if (firebaseEnabled) {
        // 지금 열려 있는 방(들)에 한해 내 멤버 표시 이름만 갱신합니다.
        // 이미 올린 사진의 uploaderName, 방장 이름 스냅샷은 소급 수정하지 않습니다.
        Object.keys(state.rooms).forEach((code) => {
          void joinRoomRemote(code, { id: state.me.id, name }).catch(() => undefined);
        });
      }
    },
    [state.rooms, state.me.id],
  );

  // 방 삭제 — 즉시 접근을 막고, 내부 파일은 30일 보관 뒤 purgeExpiredTrash가 지웁니다
  const deleteRoom = useCallback(
    (code: string) => {
      dispatch({ type: 'patchRoom', code, patch: { deletedAt: Date.now() } });
      if (firebaseEnabled) void patchRoomRemote(code, { deletedAt: Date.now() }).catch(() => undefined);
    },
    [],
  );

  const value = useMemo<StoreValue>(
    () => ({ ...state, dispatch, toasts, toast, dismissToast, setName, deleteRoom }),
    [state, toasts, toast, dismissToast, setName, deleteRoom],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('StoreProvider 안에서만 쓸 수 있어요');
  return ctx;
}

export function useRoom(code: string | undefined): Room | undefined {
  const { rooms } = useStore();
  return code ? rooms[code] : undefined;
}

/** Firebase 모드에서 특정 방을 실시간 구독합니다. code가 바뀌면 자동으로 재구독합니다.
 * 로컬 모드에서는 아무 것도 하지 않습니다(이미 로컬 상태가 전부니까요). */
export function useRemoteRoomSync(code: string | undefined): void {
  const { dispatch, hydrated } = useStore();
  useEffect(() => {
    // hydrate가 rooms를 통째로 교체하므로, 그보다 먼저 구독을 걸면
    // 나중에 도착한 hydrate가 이미 받은 방 데이터를 덮어써버립니다.
    if (!firebaseEnabled || !code || !hydrated) return;
    const unsubscribe = subscribeRoom(code, (room) => {
      dispatch({ type: 'syncRoom', code, room });
    });
    return unsubscribe;
  }, [code, dispatch, hydrated]);
}

/** 방 안에서의 쓰기 동작 — Firebase가 켜져 있으면 Firestore에, 아니면 로컬 상태에 반영합니다.
 * Firebase 모드에서는 실시간 구독이 화면 갱신을 담당하므로 여기서 로컬 dispatch를 함께 하지 않습니다. */
export function useRoomActions(code: string) {
  const { dispatch, toast } = useStore();

  const guard = useCallback(
    (promise: Promise<unknown>) => {
      promise.catch((error: unknown) => {
        console.error(error);
        toast('네트워크 오류로 반영하지 못했어요. 다시 시도해주세요.', 'warn');
      });
    },
    [toast],
  );

  return useMemo(
    () => ({
      removePhotos(ids: string[]) {
        ids.forEach((id) => void blobStore.del(id));
        if (firebaseEnabled) guard(removePhotosRemote(code, ids));
        else dispatch({ type: 'removePhotos', code, ids });
      },
      addFolder(folder: Folder) {
        if (firebaseEnabled) guard(addFolderRemote(code, folder));
        else dispatch({ type: 'addFolder', code, folder });
      },
      renameFolder(id: string, name: string) {
        if (firebaseEnabled) guard(renameFolderRemote(code, id, name));
        else dispatch({ type: 'renameFolder', code, id, name });
      },
      deleteFolder(id: string) {
        if (firebaseEnabled) guard(deleteFolderRemote(code, id));
        else dispatch({ type: 'deleteFolder', code, id });
      },
      moveToFolder(photoIds: string[], folderId: string | null) {
        if (firebaseEnabled) guard(moveToFolderRemote(code, photoIds, folderId));
        else dispatch({ type: 'moveToFolder', code, photoIds, folderId });
      },
      patchRoom(patch: Partial<Room>) {
        if (firebaseEnabled) guard(patchRoomRemote(code, patch));
        else dispatch({ type: 'patchRoom', code, patch });
      },
      addPhotosLocal(photos: Photo[]) {
        // Firebase 모드에서는 업로드 자체가 이미 Firestore에 써서 구독으로 반영되므로 호출하지 않습니다.
        dispatch({ type: 'addPhotos', code, photos });
      },
      joinRoom(member: Me) {
        if (firebaseEnabled) guard(joinRoomRemote(code, member));
        else dispatch({ type: 'joinRoom', code, member });
      },
    }),
    [code, dispatch, guard],
  );
}
