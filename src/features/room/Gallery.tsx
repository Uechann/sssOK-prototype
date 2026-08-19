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
  onSlideStart: (clientX: number, clientY: number) => void;
}

function PhotoTile({ photo, mine, selected, desktop, onToggle, onOpen, onSlideStart }: TileProps) {
  const lastTouchAt = useRef(0);
  const clickTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
    },
    [],
  );

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
        if (!desktop) {
          onOpen();
          return;
        }
        // 더블클릭과 구분한 뒤 단일 클릭일 때만 선택합니다.
        if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
        const shift = event.shiftKey;
        clickTimer.current = window.setTimeout(() => {
          clickTimer.current = null;
          onToggle(shift);
        }, 220);
      }}
      onDoubleClick={() => {
        if (!desktop) return;
        if (clickTimer.current !== null) {
          window.clearTimeout(clickTimer.current);
          clickTimer.current = null;
        }
        onOpen();
      }}
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
          if (Date.now() - lastTouchAt.current < 700) return;
          onToggle(event.shiftKey);
        }}
        onTouchStart={(event) => {
          lastTouchAt.current = Date.now();
          event.preventDefault();
          event.stopPropagation();
          const touch = event.touches[0];
          if (touch) onSlideStart(touch.clientX, touch.clientY);
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
          onToggle={(shift) => {
            if (selection.consumeMarqueeClick()) return;
            selection.toggle(photo.id, { shift });
          }}
          onOpen={() => {
            // PC 드래그 선택 직후 발생하는 click은 상세 열기로 이어지지 않게 합니다.
            if (selection.consumeMarqueeClick()) return;
            onOpen(photo.id);
          }}
          onSlideStart={(clientX, clientY) => selection.onSlideStart(photo.id, clientX, clientY)}
        />
      ))}
      <div className="grid__sentinel" ref={sentinel} />
      {selection.marquee && <div className="marquee" style={selection.marquee} />}
    </div>
  );
}
