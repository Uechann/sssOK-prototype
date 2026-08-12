import { useEffect, useMemo, useRef, useState } from 'react';
import type { Photo } from '../../types';
import { IconCheck, IconPlay } from '../../components/Icons';
import { formatDuration } from '../../lib/format';
import type { useSelection } from './useSelection';
import './room.css';

const PAGE = 30; // 30개씩 점진 렌더링

interface TileProps {
  photo: Photo;
  mine: boolean;
  selected: boolean;
  desktop: boolean;
  onToggle: (shift: boolean) => void;
  onOpen: () => void;
  onSlideStart: () => void;
}

function PhotoTile({ photo, mine, selected, desktop, onToggle, onOpen, onSlideStart }: TileProps) {
  return (
    <div
      className="tile"
      data-photo-id={photo.id}
      data-selected={selected}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${photo.uploaderName}님이 올린 ${photo.name}`}
      onClick={(event) => {
        // 웹: 클릭=선택 / 더블클릭=자세히 보기, 모바일: 탭=자세히 보기
        if (desktop) onToggle(event.shiftKey);
        else onOpen();
      }}
      onDoubleClick={() => desktop && onOpen()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen();
        if (event.key === ' ') {
          event.preventDefault();
          onToggle(event.shiftKey);
        }
      }}
    >
      <img className="tile__img" src={photo.poster} alt="" loading="lazy" draggable={false} />

      {photo.kind === 'video' && (
        <>
          <span className="tile__play">
            <IconPlay size={20} />
          </span>
          {photo.durationSec !== undefined && (
            <span className="tile__duration">{formatDuration(photo.durationSec)}</span>
          )}
        </>
      )}

      <span className="tile__badge" data-mine={mine}>
        {mine ? '나' : photo.uploaderName}
      </span>

      <button
        type="button"
        className="tile__check"
        aria-label={selected ? '선택 해제' : '선택'}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(event.shiftKey);
        }}
        onTouchStart={(event) => {
          event.stopPropagation();
          onSlideStart();
        }}
      >
        <IconCheck size={15} />
      </button>
    </div>
  );
}

export function Gallery({
  photos,
  meId,
  desktop,
  selection,
  onOpen,
}: {
  photos: Photo[];
  meId: string;
  desktop: boolean;
  selection: ReturnType<typeof useSelection>;
  onOpen: (photoId: string) => void;
}) {
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLimit(PAGE);
  }, [photos.length === 0]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setLimit((prev) => (prev >= photos.length ? prev : prev + PAGE));
        }
      },
      { rootMargin: '320px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [photos.length]);

  const visible = useMemo(() => photos.slice(0, limit), [photos, limit]);

  return (
    <div
      className="grid"
      ref={selection.gridRef}
      onMouseDown={desktop ? selection.onMarqueeStart : undefined}
      onTouchMove={selection.onSlideMove}
      onTouchEnd={selection.onSlideEnd}
      onTouchCancel={selection.onSlideEnd}
    >
      {visible.map((photo) => (
        <PhotoTile
          key={photo.id}
          photo={photo}
          mine={photo.uploaderId === meId}
          selected={selection.isSelected(photo.id)}
          desktop={desktop}
          onToggle={(shift) => selection.toggle(photo.id, { shift })}
          onOpen={() => onOpen(photo.id)}
          onSlideStart={() => selection.onSlideStart(photo.id)}
        />
      ))}
      <div className="grid__sentinel" ref={sentinel} />
      {selection.marquee && <div className="marquee" style={selection.marquee} />}
    </div>
  );
}
