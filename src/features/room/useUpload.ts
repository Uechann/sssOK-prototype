import { useCallback, useRef, useState } from 'react';
import * as amplitude from '@amplitude/unified';
import type { Photo, TransferState, UploadItem } from '../../types';
import { uid } from '../../lib/format';
import { blobStore } from '../../lib/idb';
import { FIRESTORE_INLINE_BUDGET, kindOf, optimize, overLimitReason } from '../../lib/media';
import { firebaseEnabled } from '../../lib/firebase';
import { action, fail } from '../../lib/analytics';
import { AMPLITUDE_EVENTS } from '../../lib/amplitudeEvents';
import { uploadPhotoRemote } from '../../store/remote';

export interface OversizedFile {
  name: string;
  size: number;
  reason: string;
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

interface Options {
  me: { id: string; name: string };
  roomCode: string;
  /** 업로드 자동 분류 — 지금 보고 있는 폴더로 바로 담깁니다 */
  targetFolderId: string | null;
  onUploaded: (photos: Photo[]) => void;
  /** 실패를 강제로 만들고 싶을 때 (오프라인 · 데모 시나리오) */
  shouldFail: () => string | null;
}

export function useUpload({ me, roomCode, targetFolderId, onUploaded, shouldFail }: Options) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [transfer, setTransfer] = useState<TransferState | null>(null);
  const [oversized, setOversized] = useState<OversizedFile[]>([]);
  const [failures, setFailures] = useState<UploadItem[]>([]);
  const canceled = useRef(false);
  const running = useRef(false);

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...next } : item)));
  }, []);

  const uploadOne = useCallback(
    async (
      item: UploadItem,
      folderIds: string[],
      onItemProgress: (percent: number) => void,
    ): Promise<Photo> => {
      const reportProgress = (percent: number) => {
        patch(item.id, { progress: percent });
        onItemProgress(percent);
      };
      // 이미지를 Firestore 문서 안에 그대로 넣는 모드에서는 예산 안에 들어오도록 더 압축합니다
      const inlineBudget = firebaseEnabled && item.kind === 'image' ? FIRESTORE_INLINE_BUDGET : undefined;
      // 자동 최적화: 1600px 리사이즈 + 압축 (GIF는 원본 유지)
      const optimized = await optimize(item.file, item.kind, inlineBudget);
      const id = uid('p_');

      if (firebaseEnabled) {
        return uploadPhotoRemote({
          id,
          code: roomCode,
          name: item.name,
          kind: item.kind,
          blob: optimized.blob,
          poster: optimized.poster,
          width: optimized.width,
          height: optimized.height,
          originalSize: item.size,
          durationSec: optimized.durationSec,
          uploaderId: me.id,
          uploaderName: me.name,
          folderIds,
          onProgress: reportProgress,
        });
      }

      // 로컬 모드 — IndexedDB에 바이트를 넣고 진행률은 연출로 채웁니다
      for (let p = 20; p <= 100; p += 20) {
        if (canceled.current) break;
        await sleep(60);
        reportProgress(p);
      }
      await blobStore.put(id, optimized.blob);
      const src = URL.createObjectURL(optimized.blob);
      return {
        id,
        name: item.name,
        kind: item.kind,
        src,
        poster: optimized.poster || src,
        width: optimized.width,
        height: optimized.height,
        size: optimized.blob.size,
        originalSize: item.size,
        durationSec: optimized.durationSec,
        uploaderId: me.id,
        uploaderName: me.name,
        createdAt: Date.now(),
        folderIds,
      };
    },
    [me.id, me.name, patch, roomCode],
  );

  const run = useCallback(
    async (queue: UploadItem[]) => {
      if (running.current) return;
      running.current = true;
      canceled.current = false;

      const total = queue.length;
      const startedAt = Date.now();
      const uploaded: Photo[] = [];
      const failed: UploadItem[] = [];
      const folderIds = targetFolderId ? [targetFolderId] : [];
      const totalBytes = queue.reduce((sum, item) => sum + Math.max(item.size, 1), 0);
      let completedBytes = 0;
      let done = 0;

      setTransfer({ kind: 'upload', done: 0, total, percent: 0, canceled: false });

      for (const item of queue) {
        if (canceled.current) break;
        patch(item.id, { status: 'uploading', progress: 0 });

        try {
          const reason = shouldFail();
          if (reason) throw new Error(reason);

          const photo = await uploadOne(item, folderIds, (itemPercent) => {
            const currentBytes = Math.max(item.size, 1) * (itemPercent / 100);
            setTransfer({
              kind: 'upload',
              done,
              total,
              percent: Math.min(
                99,
                Math.round(((completedBytes + currentBytes) / totalBytes) * 100),
              ),
              canceled: false,
            });
          });
          uploaded.push(photo);
          patch(item.id, { status: 'done', progress: 100 });
        } catch (error) {
          const message = error instanceof Error ? error.message : '알 수 없는 오류';
          // 사유별로 남깁니다 — 영상만 실패하는지, 특정 용량에서 무너지는지 여기서 갈립니다
          fail('upload.file', {
            reason: message,
            kind: item.kind,
            sizeKb: Math.round(item.size / 1024),
          });
          patch(item.id, { status: 'failed', error: message });
          failed.push({ ...item, status: 'failed', error: message });
        }

        done += 1;
        completedBytes += Math.max(item.size, 1);
        setTransfer({
          kind: 'upload',
          done,
          total,
          percent: Math.round((completedBytes / totalBytes) * 100),
          canceled: false,
        });
      }

      action('upload.done', {
        uploaded: uploaded.length,
        failed: failed.length,
        canceled: canceled.current,
        ms: Date.now() - startedAt,
      });
      if (uploaded.length > 0) {
        amplitude.track(AMPLITUDE_EVENTS.PHOTO_UPLOADED, {
          photo_count: uploaded.length,
          failed_count: failed.length,
        });
        onUploaded(uploaded);
      }
      if (failed.length > 0) {
        amplitude.track(AMPLITUDE_EVENTS.PHOTO_UPLOAD_FAILED, {
          failed_count: failed.length,
          reason: 'upload_error',
        });
      }
      setFailures(failed);
      setTransfer(null);
      setItems([]);
      running.current = false;
      return { uploaded: uploaded.length, failed: failed.length, canceled: canceled.current };
    },
    [onUploaded, patch, shouldFail, targetFolderId, uploadOne],
  );

  /** 파일 선택 · 드래그&드롭 공통 진입점 */
  const addFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const tooBig: OversizedFile[] = [];
      const queue: UploadItem[] = [];

      for (const file of files) {
        const kind = kindOf(file);
        if (!kind) continue; // 이미지·영상만
        const reason = overLimitReason(file, kind);
        if (reason) {
          fail('upload.oversize', { reason, kind, sizeKb: Math.round(file.size / 1024) });
          tooBig.push({ name: file.name, size: file.size, reason });
          continue;
        }
        queue.push({
          id: uid('up_'),
          file,
          name: file.name,
          size: file.size,
          kind,
          status: 'waiting',
          progress: 0,
        });
      }

      setOversized(tooBig);
      if (tooBig.length > 0) {
        amplitude.track(AMPLITUDE_EVENTS.PHOTO_UPLOAD_FAILED, {
          failed_count: tooBig.length,
          reason: 'oversize',
        });
      }
      action('upload.start', {
        count: queue.length,
        images: queue.filter((q) => q.kind === 'image').length,
        videos: queue.filter((q) => q.kind === 'video').length,
        rejected: tooBig.length,
      });
      if (queue.length === 0) return null;
      setItems(queue);
      return run(queue);
    },
    [run],
  );

  /** 실패한 것만 골라 재시도 */
  const retryFailed = useCallback(async () => {
    const retry = failures.map((item) => ({
      ...item,
      id: uid('up_'),
      status: 'waiting' as const,
      progress: 0,
      error: undefined,
    }));
    setFailures([]);
    if (retry.length === 0) return null;
    action('upload.retry', { count: retry.length });
    setItems(retry);
    return run(retry);
  }, [failures, run]);

  const cancel = useCallback(() => {
    action('upload.cancel');
    canceled.current = true;
  }, []);

  return {
    items,
    transfer,
    oversized,
    failures,
    addFiles,
    retryFailed,
    cancel,
    clearOversized: () => setOversized([]),
    clearFailures: () => setFailures([]),
  };
}
