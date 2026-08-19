import type { MediaKind } from '../types';

export const IMAGE_LIMIT = 10 * 1024 * 1024; // 이미지 최대 10MB
export const VIDEO_LIMIT = 1024 * 1024 * 1024; // 영상 최대 1GB
export const MAX_EDGE = 1600; // 긴 변 1600px로 리사이즈
const TARGET_BYTES = 1.5 * 1024 * 1024; // 이 이하로 떨어지면 2차 압축 생략

export function kindOf(file: File): MediaKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return null;
}

export function limitFor(kind: MediaKind): number {
  return kind === 'image' ? IMAGE_LIMIT : VIDEO_LIMIT;
}

export function overLimitReason(file: File, kind: MediaKind): string | null {
  if (kind === 'image' && file.size > IMAGE_LIMIT) return '이미지 최대 10MB 초과';
  if (kind === 'video' && file.size > VIDEO_LIMIT) return '영상 최대 1GB 초과';
  return null;
}

export interface OptimizedMedia {
  blob: Blob;
  width: number;
  height: number;
  /** 영상 썸네일 (이미지는 빈 문자열 → src를 그대로 씁니다) */
  poster: string;
  durationSec?: number;
}

function drawToCanvas(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
  }
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function fitted(w: number, h: number): [number, number] {
  const longest = Math.max(w, h);
  if (longest <= MAX_EDGE) return [w, h];
  const ratio = MAX_EDGE / longest;
  return [Math.round(w * ratio), Math.round(h * ratio)];
}

/** 이미지 자동 최적화: 1600px 리사이즈 + 압축, 여전히 크면 2차 압축.
 * GIF는 애니메이션이 깨지므로 원본을 그대로 유지합니다. */
async function optimizeImage(file: File): Promise<OptimizedMedia> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('이미지를 읽지 못했어요'));
      el.src = url;
    });

    if (file.type === 'image/gif') {
      // GIF는 다시 그리면 애니메이션이 깨지므로 원본을 그대로 씁니다.
      return { blob: file, width: img.naturalWidth, height: img.naturalHeight, poster: '' };
    }

    const [w, h] = fitted(img.naturalWidth, img.naturalHeight);
    const canvas = drawToCanvas(img, w, h);
    let blob = (await toBlob(canvas, 0.82)) ?? file;
    if (blob.size > TARGET_BYTES) {
      // 2차 압축
      blob = (await toBlob(canvas, 0.62)) ?? blob;
    }
    // 최적화가 오히려 손해면 원본 유지
    if (blob.size >= file.size && w === img.naturalWidth) {
      return { blob: file, width: w, height: h, poster: '' };
    }
    return { blob, width: w, height: h, poster: '' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 영상은 재인코딩하지 않고 첫 프레임만 썸네일로 뽑습니다. */
async function optimizeVideo(file: File): Promise<OptimizedMedia> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const meta = await new Promise<{ w: number; h: number; d: number }>((resolve, reject) => {
      video.onloadedmetadata = () =>
        resolve({ w: video.videoWidth, h: video.videoHeight, d: video.duration || 0 });
      video.onerror = () => reject(new Error('영상을 읽지 못했어요'));
    });

    let poster = '';
    try {
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error('썸네일 실패'));
        video.currentTime = Math.min(0.1, meta.d / 2 || 0.1);
      });
      const [w, h] = fitted(meta.w || MAX_EDGE, meta.h || MAX_EDGE);
      poster = drawToCanvas(video, w, h).toDataURL('image/jpeg', 0.7);
    } catch {
      poster = '';
    }

    return {
      blob: file,
      width: meta.w || 0,
      height: meta.h || 0,
      poster,
      durationSec: meta.d,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function optimize(file: File, kind: MediaKind): Promise<OptimizedMedia> {
  return kind === 'image' ? optimizeImage(file) : optimizeVideo(file);
}
