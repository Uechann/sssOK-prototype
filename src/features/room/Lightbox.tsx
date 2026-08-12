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
import { formatBytes, formatDuration, formatWhen } from '../../lib/format';
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
  const [showDetail, setShowDetail] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

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
        else if (event.key === 'i') setShowDetail((prev) => !prev);
      },
      [go, onClose],
    ),
  );

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
  }, [photo?.id]);

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

  const onTouchEnd = () => {
    const current = drag;
    setDrag(null);
    touchStart.current = null;
    if (!current) return;
    // 아래로 내려 닫기
    if (current.y > 96 && current.y > Math.abs(current.x)) {
      onClose();
      return;
    }
    if (Math.abs(current.x) > SWIPE && Math.abs(current.x) > current.y) {
      go(current.x < 0 ? 1 : -1);
    }
  };

  const duration = videoRef.current?.duration || photo.durationSec || 0;
  const played = (progress / (duration || 1)) * 100;

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
        <button
          type="button"
          className="lightbox__pick"
          aria-pressed={selected}
          aria-label={selected ? '선택 해제' : '선택'}
          onClick={onToggleSelect}
        >
          <IconCheck size={19} />
        </button>
        <span className="lightbox__index">
          {index + 1} / {photos.length}
        </span>
        <button
          type="button"
          className="lightbox__pick"
          aria-pressed={showDetail}
          aria-label="상세 정보"
          onClick={() => setShowDetail((prev) => !prev)}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <button type="button" className="lightbox__close" aria-label="닫기" onClick={onClose}>
          <IconClose size={20} />
        </button>
      </div>

      <div className="lightbox__stage">
        {photo.kind === 'video' ? (
          <>
            <video
              ref={videoRef}
              className="lightbox__media"
              src={photo.src}
              poster={photo.poster}
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
        ) : (
          <img className="lightbox__media" src={photo.src} alt={photo.name} draggable={false} />
        )}

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

      {showDetail && (
        <div className="lightbox__playbar" style={{ display: 'block', color: '#c8c5c0' }}>
          <p style={{ fontSize: 12, lineHeight: 1.9 }}>
            파일명 · {photo.name}
            <br />
            크기 · {photo.width}×{photo.height} · {formatBytes(photo.size)}
            {photo.originalSize > photo.size && ` (원본 ${formatBytes(photo.originalSize)})`}
            <br />
            올린 사람 · {photo.uploaderName}
            {photo.place && (
              <>
                <br />
                위치 · {photo.place}
              </>
            )}
          </p>
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
          onClick={onDelete}
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

      <p className="lightbox__hint">
        {desktop ? '← → 이동 · ESC 닫기' : '좌우로 밀어 이동 · 아래로 내려 닫기'}
      </p>
    </div>
  );
}
