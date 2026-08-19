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

/** 모바일 사진첩 저장 — iOS·Android 모두 공유 시트의 "이미지 저장"으로 이어집니다 */
export function canSaveToPhotos(photos: Photo[]): boolean {
  if (typeof navigator.canShare !== 'function') return false;
  const probe = new File([new Blob()], photos[0]?.name ?? 'photo.jpg', {
    type: photos[0]?.kind === 'video' ? 'video/mp4' : 'image/jpeg',
  });
  return navigator.canShare({ files: [probe] });
}

interface Options {
  roomCode: string;
  onDone: (count: number) => void;
  onFail: (count: number) => void;
  shouldFail: () => boolean;
}

export function useDownload({ roomCode, onDone, onFail, shouldFail }: Options) {
  const [transfer, setTransfer] = useState<TransferState | null>(null);
  const canceled = useRef(false);

  const cancel = useCallback(() => {
    action('download.cancel');
    canceled.current = true;
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
      const blobs: { name: string; blob: Blob }[] = [];
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
          blobs.push({ name: uniqueName(taken, photo.name), blob });
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

      try {
        if (toPhotoLibrary) {
          // 사진첩 저장 (공유 시트)
          const files = blobs.map(
            ({ name, blob }) => new File([blob], name, { type: blob.type || 'image/jpeg' }),
          );
          await navigator.share({ files, title: '쏙에서 받은 사진' });
        } else if (mode === 'zip') {
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
      } catch (error) {
        setTransfer(null);
        // 공유 시트를 사용자가 닫은 경우는 실패로 보지 않습니다
        if ((error as Error)?.name !== 'AbortError') {
          fail('download.save_failed', { mode, count: blobs.length, toPhotoLibrary });
          amplitude.track(AMPLITUDE_EVENTS.PHOTO_DOWNLOAD_FAILED, {
            failed_count: blobs.length,
            reason: 'save_failed',
            mode: toPhotoLibrary ? 'photos' : mode,
          });
          onFail(blobs.length);
          return;
        }
        // 공유 시트를 사용자가 닫은 경우 — 실패가 아니라 "저장을 그만둠"입니다
        action('download.share_dismissed', { count: blobs.length });
        return;
      }

      setTransfer(null);
      action('download.done', {
        mode: toPhotoLibrary ? 'photos' : mode,
        saved: blobs.length,
        failed,
        ms: Date.now() - startedAt,
      });
      amplitude.track(AMPLITUDE_EVENTS.PHOTO_DOWNLOADED, {
        photo_count: blobs.length,
        mode: toPhotoLibrary ? 'photos' : mode,
      });
      if (failed > 0) onFail(failed);
      else onDone(blobs.length);
    },
    [onDone, onFail, roomCode, shouldFail],
  );

  return { transfer, start, cancel };
}
