import { useCallback, useRef, useState } from 'react';
import JSZip from 'jszip';
import * as amplitude from '@amplitude/unified';
import type { Photo, TransferState } from '../../types';
import { action, fail } from '../../lib/analytics';
import { AMPLITUDE_EVENTS } from '../../lib/amplitudeEvents';

export type DownloadMode = 'each' | 'zip';

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function toBlob(
  photo: Photo,
  onProgress: (loaded: number, expected: number) => void,
): Promise<Blob> {
  const response = await fetch(photo.src);
  if (!response.ok) throw new Error(`다운로드 실패 (${response.status})`);

  const expected = Number(response.headers.get('content-length')) || Math.max(photo.size, 1);
  if (!response.body) {
    const blob = await response.blob();
    onProgress(blob.size, expected);
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      loaded += value.byteLength;
      onProgress(loaded, expected);
    }
  }
  return new Blob(chunks, {
    type: response.headers.get('content-type') || undefined,
  });
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename; // 원본 파일명 유지
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 파일명이 겹치면 (1), (2) … 를 붙여 원본 이름을 최대한 지킵니다 */
function uniqueName(taken: Set<string>, name: string): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);
  let i = 1;
  while (taken.has(`${base} (${i})${ext}`)) i += 1;
  const next = `${base} (${i})${ext}`;
  taken.add(next);
  return next;
}

/** 확장자 → MIME. 공유 시트는 이 값으로 "이미지 저장"을 띄울지 정합니다. */
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
};

const EMPTY_BLOB = new Blob([new Uint8Array(1)]);

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/** 공유 시트에 넘길 MIME을 정합니다.
 * 응답 헤더를 그대로 믿으면 안 됩니다 — 업로드 때 contentType이 비어 있던 파일은
 * Storage가 application/octet-stream으로 돌려주는데, 그대로 넘기면 iOS가 이미지로
 * 보지 않아 시트는 떠도 "이미지 저장"이 동작하지 않습니다. 확장자를 먼저 봅니다. */
function shareTypeFor(photo: Photo, blob: Blob): string {
  const byExt = MIME_BY_EXT[extOf(photo.name)];
  if (byExt) return byExt;
  if (blob.type.startsWith('image/') || blob.type.startsWith('video/')) return blob.type;
  return photo.kind === 'video' ? 'video/mp4' : 'image/jpeg';
}

/** 확장자가 없는 파일은 MIME에 맞는 확장자를 붙여줍니다 — 이름과 형식이 어긋나면
 * 사진첩이 받아주지 않습니다. */
function shareNameFor(name: string, type: string): string {
  if (extOf(name)) return name;
  const ext = Object.keys(MIME_BY_EXT).find((key) => MIME_BY_EXT[key] === type);
  return ext ? `${name}.${ext}` : name;
}

function toShareFile(name: string, blob: Blob, photo: Photo): File {
  const type = shareTypeFor(photo, blob);
  return new File([blob], shareNameFor(name, type), { type });
}

/** 모바일 사진첩 저장 — iOS·Android 모두 공유 시트를 거칩니다.
 * 실제로 보낼 것과 같은 이름·타입으로 물어봐야 합니다. 대표 한 장만 image/jpeg로
 * 떠보면, 영상이 섞였거나 확장자가 다른 방에서 버튼만 뜨고 저장은 실패합니다. */
export function canSaveToPhotos(photos: Photo[]): boolean {
  if (photos.length === 0) return false;
  if (typeof navigator.canShare !== 'function') return false;
  // 렌더마다 도는 함수라 형식별로 한 장씩만 떠봅니다 — 200장을 골라도 탐침은 한두 개입니다.
  // (전체 목록에 대한 진짜 확인은 파일을 다 받은 뒤 start()에서 한 번 더 합니다)
  const seen = new Set<string>();
  const probes: File[] = [];
  for (const photo of photos) {
    const type = shareTypeFor(photo, EMPTY_BLOB);
    if (seen.has(type)) continue;
    seen.add(type);
    probes.push(new File([EMPTY_BLOB], shareNameFor(photo.name, type), { type }));
  }
  try {
    return navigator.canShare({ files: probes });
  } catch {
    return false;
  }
}

/** 받아는 뒀고, 사용자가 "사진첩에 저장"을 누르면 곧바로 공유 시트로 넘길 파일들 */
export interface PendingShare {
  files: File[];
  count: number;
}

interface Options {
  roomCode: string;
  onDone: (count: number) => void;
  onFail: (count: number) => void;
  shouldFail: () => boolean;
}

export function useDownload({ roomCode, onDone, onFail, shouldFail }: Options) {
  const [transfer, setTransfer] = useState<TransferState | null>(null);
  const [pendingShare, setPendingShare] = useState<PendingShare | null>(null);
  const canceled = useRef(false);

  const cancel = useCallback(() => {
    action('download.cancel');
    canceled.current = true;
  }, []);

  /** 반드시 버튼 onClick 안에서 부릅니다 — navigator.share는 사용자 조작 직후에만 열립니다. */
  const shareToPhotos = useCallback(async () => {
    const pending = pendingShare;
    if (!pending) return;
    setPendingShare(null);
    try {
      await navigator.share({ files: pending.files, title: '쏙에서 받은 사진' });
    } catch (error) {
      // 사용자가 시트를 닫은 건 실패가 아니라 "저장을 그만둠"입니다
      if ((error as Error)?.name === 'AbortError') {
        action('download.share_dismissed', { count: pending.count });
        return;
      }
      fail('download.save_failed', { mode: 'photos', count: pending.count, toPhotoLibrary: true });
      amplitude.track(AMPLITUDE_EVENTS.PHOTO_DOWNLOAD_FAILED, {
        failed_count: pending.count,
        reason: 'save_failed',
        mode: 'photos',
      });
      onFail(pending.count);
      return;
    }
    action('download.done', { mode: 'photos', saved: pending.count, failed: 0 });
    amplitude.track(AMPLITUDE_EVENTS.PHOTO_DOWNLOADED, {
      photo_count: pending.count,
      mode: 'photos',
    });
    onDone(pending.count);
  }, [pendingShare, onDone, onFail]);

  const dismissShare = useCallback(() => {
    setPendingShare((pending) => {
      if (pending) action('download.share_dismissed', { count: pending.count });
      return null;
    });
  }, []);

  const start = useCallback(
    async (photos: Photo[], mode: DownloadMode, toPhotoLibrary = false) => {
      if (photos.length === 0) return;
      canceled.current = false;
      const total = photos.length;
      const startedAt = Date.now();
      const expectedSizes = photos.map((photo) => Math.max(photo.size, 1));
      const totalBytes = expectedSizes.reduce((sum, size) => sum + size, 0);
      const downloadWeight = mode === 'zip' ? 0.88 : 1;
      setTransfer({ kind: 'download', done: 0, total, percent: 0, canceled: false });

      const taken = new Set<string>();
      const blobs: { name: string; blob: Blob; photo: Photo }[] = [];
      let failed = 0;
      let completedBytes = 0;

      for (let i = 0; i < photos.length; i += 1) {
        if (canceled.current) break;
        const photo = photos[i];
        try {
          if (shouldFail()) throw new Error('네트워크 오류');
          const expectedSize = expectedSizes[i];
          const blob = await toBlob(photo, (loaded, responseExpected) => {
            if (canceled.current) return;
            const normalizedLoaded = Math.min(
              expectedSize,
              expectedSize * (loaded / Math.max(responseExpected, 1)),
            );
            setTransfer({
              kind: 'download',
              done: i,
              total,
              percent: Math.round(
                ((completedBytes + normalizedLoaded) / totalBytes) * 100 * downloadWeight,
              ),
              canceled: false,
            });
          });
          blobs.push({ name: uniqueName(taken, photo.name), blob, photo });
        } catch {
          failed += 1;
        }
        completedBytes += expectedSizes[i];
        await sleep(90);
        setTransfer({
          kind: 'download',
          done: i + 1,
          total,
          percent: Math.round((completedBytes / totalBytes) * 100 * downloadWeight),
          canceled: false,
        });
      }

      const stopped = canceled.current;
      if (stopped) {
        setTransfer(null);
        return;
      }

      if (failed > 0 && blobs.length === 0) {
        setTransfer(null);
        fail('download.all_failed', { mode, count: total });
        amplitude.track(AMPLITUDE_EVENTS.PHOTO_DOWNLOAD_FAILED, {
          failed_count: failed,
          reason: 'all_failed',
          mode,
        });
        onFail(failed);
        return;
      }

      if (toPhotoLibrary) {
        const files = blobs.map(({ name, blob, photo }) => toShareFile(name, blob, photo));
        if (typeof navigator.canShare === 'function' && !navigator.canShare({ files })) {
          setTransfer(null);
          fail('download.save_failed', { mode, count: files.length, toPhotoLibrary });
          amplitude.track(AMPLITUDE_EVENTS.PHOTO_DOWNLOAD_FAILED, {
            failed_count: files.length,
            reason: 'cannot_share',
            mode: 'photos',
          });
          onFail(files.length);
          return;
        }
        // navigator.share는 사용자가 방금 누른 직후(transient activation)에만 열립니다.
        // 여기까지 오는 동안 사진을 네트워크로 받느라 그 자격이 이미 만료돼서, 지금 바로
        // 부르면 Android는 NotAllowedError를 던지고 iOS는 시트가 뜨지 않거나 저장이 실패합니다.
        // 그래서 파일만 준비해두고, 실제 호출은 사용자가 버튼을 누르는 순간에 합니다.
        setTransfer({ kind: 'download', done: total, total, percent: 100, canceled: false });
        await sleep(320);
        setTransfer(null);
        setPendingShare({ files, count: files.length });
        return;
      }

      try {
        if (mode === 'zip') {
          const zip = new JSZip();
          blobs.forEach(({ name, blob }) => zip.file(name, blob));
          setTransfer({
            kind: 'download',
            done: total,
            total,
            percent: 88,
            canceled: false,
            label: '압축 중',
          });
          const archive = await zip.generateAsync({ type: 'blob' }, (metadata) => {
            setTransfer({
              kind: 'download',
              done: total,
              total,
              percent: Math.round(88 + metadata.percent * 0.12),
              canceled: false,
              label: '압축 중',
            });
          });
          saveBlob(archive, `sssOK_${roomCode}.zip`);
        } else {
          for (const { name, blob } of blobs) {
            saveBlob(blob, name);
            await sleep(160); // 브라우저가 연속 다운로드를 막지 않도록
          }
        }
      } catch {
        setTransfer(null);
        fail('download.save_failed', { mode, count: blobs.length, toPhotoLibrary: false });
        amplitude.track(AMPLITUDE_EVENTS.PHOTO_DOWNLOAD_FAILED, {
          failed_count: blobs.length,
          reason: 'save_failed',
          mode,
        });
        onFail(blobs.length);
        return;
      }

      // 100% 상태를 잠깐 붙잡아둡니다 — 안 그러면 setTransfer(null)과
      // 같은 틱에 배칭되어 100%가 화면에 그려지지도 못하고 사라집니다
      if (!canceled.current) {
        setTransfer({ kind: 'download', done: total, total, percent: 100, canceled: false });
        await sleep(320);
      }
      setTransfer(null);
      action('download.done', {
        mode,
        saved: blobs.length,
        failed,
        ms: Date.now() - startedAt,
      });
      amplitude.track(AMPLITUDE_EVENTS.PHOTO_DOWNLOADED, {
        photo_count: blobs.length,
        mode,
      });
      if (failed > 0) onFail(failed);
      else onDone(blobs.length);
    },
    [onDone, onFail, roomCode, shouldFail],
  );

  return { transfer, start, cancel, pendingShare, shareToPhotos, dismissShare };
}
