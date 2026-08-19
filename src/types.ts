export type UploadPolicy = 'everyone' | 'host';
export type ExpiryHours = 24 | 72;

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface Member {
  id: string;
  name: string;
}

export type MediaKind = 'image' | 'video';

export interface Photo {
  id: string;
  /** 원본 파일명 — 다운로드 시 그대로 유지 */
  name: string;
  kind: MediaKind;
  /** blob: 또는 data: URL. IndexedDB blob에서 세션마다 다시 만들어집니다. */
  src: string;
  /** 영상 썸네일(이미지는 src와 동일) */
  poster: string;
  width: number;
  height: number;
  /** 최적화 후 바이트 */
  size: number;
  /** 최적화 전 바이트 */
  originalSize: number;
  durationSec?: number;
  uploaderId: string;
  uploaderName: string;
  createdAt: number;
  /** 사진은 여러 폴더에 함께 담길 수 있습니다 */
  folderIds: string[];
  /** 자세히 보기 · 위치 표시 */
  place?: string;
}

export interface Room {
  code: string;
  name: string;
  hostId: string;
  hostName: string;
  createdAt: number;
  expiresAt: number;
  /** 사용자가 선택한 방 유지 기간. 기존 데이터에는 없을 수 있습니다. */
  expiryHours?: ExpiryHours;
  uploadPolicy: UploadPolicy;
  /** 입장 암호 (선택) */
  passcode?: string;
  folders: Folder[];
  photos: Photo[];
  members: Member[];
  /** 방 삭제 시각 — 30일 보관 후 영구 삭제 */
  deletedAt?: number;
}

export type UploadStatus = 'waiting' | 'uploading' | 'done' | 'failed';

export interface UploadItem {
  id: string;
  file: File;
  name: string;
  size: number;
  kind: MediaKind;
  status: UploadStatus;
  progress: number;
  /** 실패 사유 */
  error?: string;
}

export type TransferKind = 'upload' | 'download';

export interface TransferState {
  kind: TransferKind;
  done: number;
  total: number;
  percent: number;
  canceled: boolean;
  /** 다운로드·압축처럼 전송 안에서 단계가 바뀔 때 표시할 문구 */
  label?: string;
}

export interface Toast {
  id: string;
  message: string;
  tone: 'success' | 'warn';
  exiting?: boolean;
}

export type PhotoFilter = 'all' | 'mine' | 'others';
