import { useCallback, useRef, useState } from 'react';
import * as amplitude from '@amplitude/unified';
import type { Photo, TransferState, UploadItem } from '../../types';
import { uid } from '../../lib/format';
import { blobStore } from '../../lib/idb';
import { kindOf, optimize, overLimitReason } from '../../lib/media';
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

// 동시에 이만큼만 업로드합니다 — 순차로 하나씩 기다리면 파일마다 왕복 지연이
// 그대로 쌓이는데, 몇 개씩 겹쳐 보내면 그 지연이 겹쳐 지나가 총 시간이 줄어듭니다.
const UPLOAD_CONCURRENCY = 3;

interface Options {
  me: { id: string; name: string };
  roomCode: string;
  /** 업로드 자동 분류 — 지금 보고 있는 폴더로 바로 담깁니다 */
  targetFolderId: string | null;
  /** 파일 하나가 끝날 때마다 즉시 호출됩니다 — 갤러리에 하나씩 쌓이도록 */
  onPhotoUploaded?: (photo: Photo) => void;
  onUploaded: (photos: Photo[]) => void;
  /** 실패를 강제로 만들고 싶을 때 (오프라인 · 데모 시나리오) */
  shouldFail: () => string | null;
}

export function useUpload({
  me,
  roomCode,
  targetFolderId,
  onPhotoUploaded,
  onUploaded,
  shouldFail,
}: Options) {
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
      // 이미지·영상 모두 원본 그대로 올립니다. optimize는 표시용 치수와
      // 격자 타일용 축소본(썸네일)만 만들어 옵니다.
      const optimized = await optimize(item.file, item.kind);
      const id = uid('p_');

      if (firebaseEnabled) {
        return uploadPhotoRemote({
          id,
          code: roomCode,
          name: item.name,
          kind: item.kind,
          blob: optimized.blob,
          poster: optimized.poster,
          thumb: optimized.thumb,
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
      // 아이템별 "지금까지 올라간 바이트"를 따로 들고 있다가 매번 다 더합니다.
      // 여러 워커가 동시에 진행되므로, 콜백 하나가 자기 몫만 completedBytes에 더하는
      // 방식이면 다른 워커의 진행분이 누락돼 전체 퍼센트가 순간적으로 뒤로 튑니다.
      const progressBytes = new Map<string, number>();
      let done = 0;

      const reportOverall = () => {
        let sum = 0;
        for (const bytes of progressBytes.values()) sum += bytes;
        setTransfer({
          kind: 'upload',
          done,
          total,
          percent: Math.min(99, Math.round((sum / totalBytes) * 100)),
          canceled: false,
        });
      };

      setTransfer({ kind: 'upload', done: 0, total, percent: 0, canceled: false });

      const uploadItem = async (item: UploadItem) => {
        patch(item.id, { status: 'uploading', progress: 0 });
        progressBytes.set(item.id, 0);

        try {
          const reason = shouldFail();
          if (reason) throw new Error(reason);

          const photo = await uploadOne(item, folderIds, (itemPercent) => {
            progressBytes.set(item.id, Math.max(item.size, 1) * (itemPercent / 100));
            reportOverall();
          });
          uploaded.push(photo);
          patch(item.id, { status: 'done', progress: 100 });
          onPhotoUploaded?.(photo);
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
        // 성공·실패 상관없이 이 아이템 몫은 다 채운 것으로 칩니다 — 안 그러면
        // 실패한 파일의 바이트가 빠져서 전체가 100%에 못 미칩니다
        progressBytes.set(item.id, Math.max(item.size, 1));
        reportOverall();
      };

      // UPLOAD_CONCURRENCY개짜리 워커 풀 — 각 워커가 큐에서 하나씩 뽑아 순서대로
      // 처리하되, 워커 여러 개가 동시에 돌아서 파일들이 겹쳐 업로드됩니다.
      let cursor = 0;
      const worker = async () => {
        while (cursor < queue.length) {
          if (canceled.current) return;
          const item = queue[cursor++];
          await uploadItem(item);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, worker),
      );

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
      // 100% 상태를 잠깐 붙잡아둡니다 — 안 그러면 setTransfer(null)과
      // 같은 틱에 배칭되어 100%가 화면에 그려지지도 못하고 사라집니다
      if (!canceled.current) {
        setTransfer({ kind: 'upload', done: total, total, percent: 100, canceled: false });
        await sleep(320);
      }
      setTransfer(null);
      setItems([]);
      running.current = false;
      return { uploaded: uploaded.length, failed: failed.length, canceled: canceled.current };
    },
    [onPhotoUploaded, onUploaded, patch, shouldFail, targetFolderId, uploadOne],
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
