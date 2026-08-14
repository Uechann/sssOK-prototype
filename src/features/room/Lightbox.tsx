import { useCallback, useEffect, useRef, useState } from 'react';
import type { Photo } from '../../types';
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconDownload,
  IconPlay,
  IconTrash,
} from '../../components/Icons';
import { formatDuration, formatWhen } from '../../lib/format';
import { useKey } from '../../lib/hooks';
import './room.css';

const SWIPE = 56;

export function Lightbox({
  photos,
  index,
  selected,
  canDelete,
  desktop,
  onIndexChange,
  onToggleSelect,
  onDelete,
  onDownload,
  onClose,
}: {
  photos: Photo[];
  index: number;
  selected: boolean;
  canDelete: boolean;
  desktop: boolean;
  onIndexChange: (next: number) => void;
  onToggleSelect: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  const photo = photos[index];
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [settling, setSettling] = useState<-1 | 1 | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number; active: boolean } | null>(null);
  const zoomResetTimer = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next < 0 || next >= photos.length) return;
      onIndexChange(next);
    },
    [index, onIndexChange, photos.length],
  );

  // PC · 방향키 이동, ESC 닫기
  useKey(
    useCallback(
      (event: KeyboardEvent) => {
        if (event.key === 'ArrowLeft') go(-1);
        else if (event.key === 'ArrowRight') go(1);
        else if (event.key === 'Escape') onClose();
      },
      [go, onClose],
    ),
  );

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setDeleteConfirm(false);
    if (zoomResetTimer.current !== null) window.clearTimeout(zoomResetTimer.current);
    setZoom(null);
  }, [photo?.id]);

  useEffect(
    () => () => {
      if (zoomResetTimer.current !== null) window.clearTimeout(zoomResetTimer.current);
    },
    [],
  );

  if (!photo) return null;

  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchMove = (event: React.TouchEvent) => {
    const start = touchStart.current;
    const touch = event.touches[0];
    if (!start || !touch) return;
    setDrag({ x: touch.clientX - start.x, y: Math.max(0, touch.clientY - start.y) });
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    const current = drag;
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    setDrag(null);
    touchStart.current = null;
    const distance = current ? Math.hypot(current.x, current.y) : 0;

    if (
      !desktop &&
      photo.kind !== 'video' &&
      start &&
      touch &&
      distance < 12 &&
      (event.target as HTMLElement).closest('.lightbox__stage')
    ) {
      const now = Date.now();
      const previous = lastTap.current;
      if (
        previous &&
        now - previous.time < 320 &&
        Math.hypot(touch.clientX - previous.x, touch.clientY - previous.y) < 36
      ) {
        toggleZoomAt(touch.clientX, touch.clientY);
        lastTap.current = null;
      } else {
        lastTap.current = { time: now, x: touch.clientX, y: touch.clientY };
      }
      return;
    }

    lastTap.current = null;
    if (!current) return;
    // 아래로 내려 닫기
    if (current.y > 96 && current.y > Math.abs(current.x)) {
      onClose();
      return;
    }
    if (Math.abs(current.x) > SWIPE && Math.abs(current.x) > current.y) {
      const delta = current.x < 0 ? 1 : -1;
      const next = index + delta;
      if (next < 0 || next >= photos.length) return;
      setSettling(delta);
      window.setTimeout(() => {
        onIndexChange(next);
        setSettling(null);
      }, 220);
    }
  };

  const duration = videoRef.current?.duration || photo.durationSec || 0;
  const played = (progress / (duration || 1)) * 100;

  const toggleZoomAt = (clientX: number, clientY: number) => {
    if (photo.kind === 'video') return;
    if (zoom?.active) {
      setZoom({ ...zoom, active: false });
      zoomResetTimer.current = window.setTimeout(() => {
        setZoom(null);
        zoomResetTimer.current = null;
      }, 220);
      return;
    }
    const box = imageRef.current?.getBoundingClientRect();
    if (!box) return;
    setZoom({
      x: Math.max(0, Math.min(100, ((clientX - box.left) / box.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - box.top) / box.height) * 100)),
      active: true,
    });
  };

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="자세히 보기"
      style={
        drag
          ? {
              transform: `translateY(${drag.y * 0.6}px)`,
              opacity: Math.max(0.4, 1 - drag.y / 420),
            }
          : undefined
      }
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="lightbox__bar">
        <button type="button" className="lightbox__pick" aria-label="뒤로가기" onClick={onClose}>
          <IconChevronLeft size={20} />
        </button>
        <span className="lightbox__index">
          {index + 1} / {photos.length}
        </span>
        <button
          type="button"
          className="lightbox__pick"
          aria-pressed={selected}
          aria-label={selected ? '선택 해제' : '선택'}
          onClick={onToggleSelect}
        >
          <IconCheck size={19} />
        </button>
      </div>

      <div className="lightbox__stage">
        <div
          className="lightbox__pages"
          data-settling={Boolean(settling)}
          style={{
            transform: settling
              ? `translateX(${settling > 0 ? '-66.666667%' : '0%'})`
              : drag
                ? `translateX(calc(-33.333333% + ${drag.x}px))`
                : 'translateX(-33.333333%)',
          }}
        >
          {[photos[index - 1], photo, photos[index + 1]].map((item, pageIndex) => (
            <div
              className="lightbox__page"
              key={item?.id ?? `empty-${pageIndex}`}
            >
              {item && pageIndex === 1 && item.kind === 'video' ? (
                <>
                  <video
                    ref={videoRef}
                    className="lightbox__media"
                    src={item.src}
                    poster={item.poster}
                    playsInline
                    onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => setPlaying(false)}
                    onClick={() => {
                      const video = videoRef.current;
                      if (!video) return;
                      if (video.paused) void video.play();
                      else video.pause();
                    }}
                  />
                  {!playing && (
                    <button
                      type="button"
                      aria-label="재생"
                      onClick={() => void videoRef.current?.play()}
                      style={{
                        position: 'absolute',
                        width: 72,
                        height: 72,
                        borderRadius: '50%',
                        background: '#e9e7e3',
                        color: '#2c2b30',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <IconPlay size={30} />
                    </button>
                  )}
                </>
              ) : item ? (
                <img
                  ref={pageIndex === 1 ? imageRef : undefined}
                  className="lightbox__media"
                  data-zoomed={Boolean(zoom?.active) && pageIndex === 1}
                  data-mobile-zoom={pageIndex === 1 && !desktop && item.kind !== 'video'}
                  src={item.kind === 'video' ? item.poster : item.src}
                  alt={item.name}
                  draggable={false}
                  style={
                    pageIndex === 1 && zoom
                      ? {
                          transform: zoom.active ? 'scale(2)' : 'scale(1)',
                          transformOrigin: `${zoom.x}% ${zoom.y}%`,
                        }
                      : undefined
                  }
                />
              ) : null}
            </div>
          ))}
        </div>

        {desktop && index > 0 && (
          <button
            type="button"
            className="lightbox__nav lightbox__nav--prev"
            aria-label="이전"
            onClick={() => go(-1)}
          >
            <IconChevronLeft size={20} />
          </button>
        )}
        {desktop && index < photos.length - 1 && (
          <button
            type="button"
            className="lightbox__nav lightbox__nav--next"
            aria-label="다음"
            onClick={() => go(1)}
          >
            <IconChevronRight size={20} />
          </button>
        )}
      </div>

      {photo.kind === 'video' && (
        <div className="lightbox__playbar">
          <span>{formatDuration(progress)}</span>
          <div
            className="lightbox__track"
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - box.left) / box.width;
              if (videoRef.current && duration) videoRef.current.currentTime = ratio * duration;
            }}
          >
            <div className="lightbox__track-fill" style={{ width: `${played}%` }} />
          </div>
          <span>{formatDuration(duration)}</span>
        </div>
      )}

      <div className="lightbox__foot">
        <div className="lightbox__meta">
          <p className="lightbox__uploader">{photo.uploaderName}</p>
          <p className="lightbox__sub">
            {formatWhen(photo.createdAt)} · {photo.name}
            {photo.place && ` · ${photo.place}`}
          </p>
        </div>
        <button
          type="button"
          className="lightbox__act"
          data-tone="danger"
          aria-label="삭제"
          disabled={!canDelete}
          style={canDelete ? undefined : { opacity: 0.35, cursor: 'not-allowed' }}
          onClick={() => setDeleteConfirm(true)}
        >
          <IconTrash size={21} />
        </button>
        <button
          type="button"
          className="lightbox__act"
          aria-label="다운로드"
          onClick={onDownload}
        >
          <IconDownload size={21} />
        </button>
      </div>

      {deleteConfirm && (
        <>
          <button
            type="button"
            className="lightbox__delete-dismiss"
            aria-label="삭제 메뉴 닫기"
            onClick={() => setDeleteConfirm(false)}
          />
          <div className="lightbox__delete-confirm" role="group" aria-label="사진 삭제 확인">
            <button type="button" onClick={() => setDeleteConfirm(false)}>
              <IconClose size={18} />
              취소
            </button>
            <button type="button" data-danger="true" onClick={onDelete}>
              <IconTrash size={18} />
              삭제
            </button>
          </div>
        </>
      )}
    </div>
  );
}
