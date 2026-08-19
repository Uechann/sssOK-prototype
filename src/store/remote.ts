/** Firestore + Storage에 직접 읽고 쓰는 계층.
 * 컬렉션은 전부 `sssok_` 로 시작해 share-drop 등 같은 프로젝트의 다른 앱과 겹치지 않습니다.
 *
 * 스키마
 *   sssok_rooms/{code}                      방 메타데이터
 *   sssok_rooms/{code}/photos/{photoId}      사진·영상 메타데이터 (원본 바이트는 Storage)
 *   sssok_rooms/{code}/folders/{folderId}    폴더
 *   sssok_rooms/{code}/members/{memberId}    참여자
 *   Storage: sssok/{code}/{photoId}/{filename}
 */
import {
  collection,
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
  uploadBytesResumable,
  type UploadTaskSnapshot,
} from 'firebase/storage';
import type { ExpiryHours, Folder, Member, Photo, Room, UploadPolicy } from '../types';
import { db, storage } from '../lib/firebase';

const ROOMS = 'sssok_rooms';
const CHUNK = 30; // Firestore 'in' 쿼리 상한

const roomRef = (code: string) => doc(db, ROOMS, code);
const photosCol = (code: string) => collection(db, ROOMS, code, 'photos');
const foldersCol = (code: string) => collection(db, ROOMS, code, 'folders');
const membersCol = (code: string) => collection(db, ROOMS, code, 'members');
const photoRef = (code: string, id: string) => doc(db, ROOMS, code, 'photos', id);
const folderRef = (code: string, id: string) => doc(db, ROOMS, code, 'folders', id);
const memberRef = (code: string, id: string) => doc(db, ROOMS, code, 'members', id);

interface RoomDoc {
  name: string;
  hostId: string;
  hostName: string;
  createdAt: number;
  expiresAt: number;
  expiryHours?: ExpiryHours;
  uploadPolicy: UploadPolicy;
  passcode?: string;
  deletedAt?: number;
}

interface PhotoDoc {
  name: string;
  kind: 'image' | 'video';
  src: string;
  poster: string;
  width: number;
  height: number;
  size: number;
  originalSize: number;
  durationSec?: number;
  uploaderId: string;
  uploaderName: string;
  createdAt: number;
  folderIds: string[];
  place?: string;
  /** 삭제 시 Storage 객체를 함께 지우기 위한 내부 필드 — 앱 도메인 타입에는 노출하지 않습니다. */
  storagePath?: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* ── 방 ──────────────────────────────────────────────── */

export async function createRoomRemote(room: Room): Promise<void> {
  const data: RoomDoc = {
    name: room.name,
    hostId: room.hostId,
    hostName: room.hostName,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    expiryHours: room.expiryHours,
    uploadPolicy: room.uploadPolicy,
    ...(room.passcode ? { passcode: room.passcode } : {}),
  };
  await setDoc(roomRef(room.code), data);
  await setDoc(memberRef(room.code, room.hostId), { name: room.hostName });
}

/** 코드 입장 화면에서 코드/암호를 확인할 때 씁니다 — 구독은 걸지 않습니다. */
export async function fetchRoomOnce(code: string): Promise<Room | null> {
  const snap = await getDoc(roomRef(code));
  if (!snap.exists()) return null;
  return { ...(snap.data() as RoomDoc), code, folders: [], photos: [], members: [] };
}

/** 방 문서 + 사진/폴더/멤버 서브컬렉션을 함께 구독해 실시간으로 합쳐줍니다. */
export function subscribeRoom(code: string, onChange: (room: Room | null) => void): Unsubscribe {
  let base: RoomDoc | null | undefined;
  let photos: Photo[] = [];
  let folders: Folder[] = [];
  let members: Member[] = [];

  const emit = () => {
    if (base === undefined) return; // 아직 첫 응답 전
    if (base === null) {
      onChange(null);
      return;
    }
    onChange({ ...base, code, photos, folders, members });
  };

  const unsubs = [
    onSnapshot(roomRef(code), (snap) => {
      base = snap.exists() ? (snap.data() as RoomDoc) : null;
      emit();
    }),
    onSnapshot(photosCol(code), (snap) => {
      photos = snap.docs
        .map((d) => {
          const data = d.data() as PhotoDoc;
          return {
            id: d.id,
            name: data.name,
            kind: data.kind,
            src: data.src,
            // 이미지는 poster를 src와 중복 저장하지 않으므로(문서 용량 절약) 여기서 채워줍니다
            poster: data.poster || data.src,
            width: data.width,
            height: data.height,
            size: data.size,
            originalSize: data.originalSize,
            durationSec: data.durationSec,
            uploaderId: data.uploaderId,
            uploaderName: data.uploaderName,
            createdAt: data.createdAt,
            folderIds: data.folderIds ?? [],
            place: data.place,
          } satisfies Photo;
        })
        .sort((a, b) => b.createdAt - a.createdAt);
      emit();
    }),
    onSnapshot(foldersCol(code), (snap) => {
      folders = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Folder, 'id'>) }))
        .sort((a, b) => a.createdAt - b.createdAt);
      emit();
    }),
    onSnapshot(membersCol(code), (snap) => {
      members = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Member, 'id'>) }));
      emit();
    }),
  ];

  return () => unsubs.forEach((unsub) => unsub());
}

export async function patchRoomRemote(code: string, patch: Partial<Room>): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.hostName !== undefined) data.hostName = patch.hostName;
  if (patch.uploadPolicy !== undefined) data.uploadPolicy = patch.uploadPolicy;
  if (patch.expiresAt !== undefined) data.expiresAt = patch.expiresAt;
  if (patch.expiryHours !== undefined) data.expiryHours = patch.expiryHours;
  if (patch.deletedAt !== undefined) data.deletedAt = patch.deletedAt;
  if ('passcode' in patch) data.passcode = patch.passcode ? patch.passcode : deleteField();
  await updateDoc(roomRef(code), data);
}

export async function joinRoomRemote(code: string, member: Member): Promise<void> {
  await setDoc(memberRef(code, member.id), { name: member.name }, { merge: true });
}

/* ── 폴더 ────────────────────────────────────────────── */

export async function addFolderRemote(code: string, folder: Folder): Promise<void> {
  await setDoc(folderRef(code, folder.id), { name: folder.name, createdAt: folder.createdAt });
}

export async function renameFolderRemote(code: string, id: string, name: string): Promise<void> {
  await updateDoc(folderRef(code, id), { name });
}

export async function deleteFolderRemote(code: string, id: string): Promise<void> {
  const affected = await getDocs(query(photosCol(code), where('folderIds', 'array-contains', id)));
  const batch = writeBatch(db);
  affected.docs.forEach((snap) => {
    const folderIds = ((snap.data() as PhotoDoc).folderIds ?? []).filter((f) => f !== id);
    batch.update(snap.ref, { folderIds });
  });
  batch.delete(folderRef(code, id));
  await batch.commit();
}

export async function moveToFolderRemote(
  code: string,
  photoIds: string[],
  folderId: string | null,
): Promise<void> {
  for (const group of chunk(photoIds, 400)) {
    const batch = writeBatch(db);
    for (const id of group) {
      if (folderId === null) {
        batch.update(photoRef(code, id), { folderIds: [] });
      } else {
        const snap = await getDoc(photoRef(code, id));
        const current = ((snap.data() as PhotoDoc | undefined)?.folderIds ?? []) as string[];
        if (!current.includes(folderId)) {
          batch.update(photoRef(code, id), { folderIds: [...current, folderId] });
        }
      }
    }
    await batch.commit();
  }
}

/* ── 사진 ────────────────────────────────────────────── */

interface UploadInput {
  id: string;
  code: string;
  name: string;
  kind: 'image' | 'video';
  blob: Blob;
  /** 영상 썸네일 — data: URL 그대로 문서에 저장합니다(이미지는 빈 문자열 → src로 대체) */
  poster: string;
  width: number;
  height: number;
  originalSize: number;
  durationSec?: number;
  uploaderId: string;
  uploaderName: string;
  folderIds: string[];
  onProgress?: (percent: number) => void;
}

function toPhoto(id: string, data: PhotoDoc): Photo {
  return {
    id,
    name: data.name,
    kind: data.kind,
    src: data.src,
    // 이미지는 poster를 src와 중복 저장하지 않으므로(문서 용량 절약) 여기서 채워줍니다
    poster: data.poster || data.src,
    width: data.width,
    height: data.height,
    size: data.size,
    originalSize: data.originalSize,
    durationSec: data.durationSec,
    uploaderId: data.uploaderId,
    uploaderName: data.uploaderName,
    createdAt: data.createdAt,
    folderIds: data.folderIds,
    place: data.place,
  };
}

// 이 이상은(원본을 그대로 올리는 이미지 중 큰 편, 또는 GIF) 끊겨도 이어 올릴 수 있는
// resumable 업로드로 보냅니다. 그 아래는 세션 핸드셰이크 없이 한 번에 보냅니다.
const RESUMABLE_THRESHOLD = 5 * 1024 * 1024;

/** 세션 생성→전송→확인을 거치는 재개 가능 업로드. 큰 파일에 씁니다. */
function uploadResumable(input: UploadInput, path: string): Promise<string> {
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, input.blob, {
    contentType: input.blob.type || undefined,
  });
  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap: UploadTaskSnapshot) => {
        input.onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      reject,
      () => {
        getDownloadURL(task.snapshot.ref).then(resolve, reject);
      },
    );
  });
}

/** 한 번의 PUT으로 끝내는 업로드. 세션 핸드셰이크가 없어 작은 파일에 훨씬 빠릅니다. */
async function uploadSingle(input: UploadInput, path: string): Promise<string> {
  const storageRef = ref(storage, path);
  input.onProgress?.(50);
  await uploadBytes(storageRef, input.blob, { contentType: input.blob.type || undefined });
  return getDownloadURL(storageRef);
}

/** 이미지 — 압축을 거쳐 대부분 작으므로 단일 PUT으로 올립니다. 압축이 안 통하는
 * 큰 GIF 등만 resumable로 보냅니다.
 * Storage 버킷 CORS 설정이 안 돼 있으면 실패합니다(README 참고). */
async function uploadImageToStorage(input: UploadInput): Promise<Photo> {
  const path = `sssok/${input.code}/${input.id}/${input.name}`;
  const src =
    input.blob.size > RESUMABLE_THRESHOLD
      ? await uploadResumable(input, path)
      : await uploadSingle(input, path);
  input.onProgress?.(100);
  const data: PhotoDoc = {
    name: input.name,
    kind: 'image',
    src,
    poster: '',
    width: input.width,
    height: input.height,
    size: input.blob.size,
    originalSize: input.originalSize,
    uploaderId: input.uploaderId,
    uploaderName: input.uploaderName,
    createdAt: Date.now(),
    folderIds: input.folderIds,
    storagePath: path,
  };
  await setDoc(photoRef(input.code, input.id), data);
  return toPhoto(input.id, data);
}

/** 영상 — 용량이 커서(최대 1GB) 항상 resumable로 올립니다.
 * Storage 버킷 CORS 설정이 안 돼 있으면 실패합니다(README 참고). */
async function uploadVideoToStorage(input: UploadInput): Promise<Photo> {
  const path = `sssok/${input.code}/${input.id}/${input.name}`;
  const src = await uploadResumable(input, path);
  const data: PhotoDoc = {
    name: input.name,
    kind: 'video',
    src,
    poster: input.poster || src,
    width: input.width,
    height: input.height,
    size: input.blob.size,
    originalSize: input.originalSize,
    uploaderId: input.uploaderId,
    uploaderName: input.uploaderName,
    createdAt: Date.now(),
    folderIds: input.folderIds,
    storagePath: path,
    // Firestore는 undefined 필드를 거부하므로 값이 있을 때만 넣습니다
    ...(input.durationSec !== undefined ? { durationSec: input.durationSec } : {}),
  };
  await setDoc(photoRef(input.code, input.id), data);
  return toPhoto(input.id, data);
}

export function uploadPhotoRemote(input: UploadInput): Promise<Photo> {
  return input.kind === 'image' ? uploadImageToStorage(input) : uploadVideoToStorage(input);
}

export async function removePhotosRemote(code: string, ids: string[]): Promise<void> {
  for (const group of chunk(ids, CHUNK)) {
    const snaps = await getDocs(query(photosCol(code), where(documentId(), 'in', group)));
    await Promise.all(
      snaps.docs.map((snap) => {
        const path = (snap.data() as PhotoDoc).storagePath;
        return path ? deleteObject(ref(storage, path)).catch(() => undefined) : Promise.resolve();
      }),
    );
    const batch = writeBatch(db);
    snaps.docs.forEach((snap) => batch.delete(snap.ref));
    await batch.commit();
  }
}
