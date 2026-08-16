import { useRef } from 'react';
import type { Folder, PhotoFilter } from '../../types';
import { IconCheck, IconClock, IconCrown, IconLink, IconMore, IconPlus } from '../../components/Icons';
import { IconButton } from '../../components/ui';
import { formatRemaining } from '../../lib/format';
import './room.css';

const FILTERS: { value: PhotoFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'mine', label: '내 사진' },
  { value: 'others', label: '다른 사람 사진' },
];

export function RoomHeader({
  displayName,
  isHost,
  roomName,
  remaining,
  folders,
  activeFolderId,
  totalCount,
  countInFolder,
  filter,
  allSelected,
  onSelectFolder,
  onAddFolder,
  onChangeFilter,
  onToggleSelectAll,
  onOpenShare,
  onOpenMenu,
}: {
  displayName: string;
  isHost: boolean;
  roomName: string;
  remaining: number;
  folders: Folder[];
  activeFolderId: string | null;
  totalCount: number;
  countInFolder: (folderId: string) => number;
  filter: PhotoFilter;
  allSelected: boolean;
  onSelectFolder: (id: string | null) => void;
  onAddFolder: () => void;
  onChangeFilter: (next: PhotoFilter) => void;
  onToggleSelectAll: () => void;
  onOpenShare: (rect: DOMRect) => void;
  onOpenMenu: (rect: DOMRect) => void;
}) {
  const shareRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const urgent = remaining <= 60 * 60 * 1000;

  return (
    <div className="room-head">
      <div className="room-head__top">
        <span className="chip" data-host={isHost}>
          {isHost && <IconCrown size={12} />}
          <span className="chip__name">{displayName}</span>
        </span>
        <span className="room-head__timer" data-urgent={urgent}>
          <IconClock size={15} />
          {formatRemaining(remaining)}
        </span>
      </div>

      <div className="room-head__title-row">
        <h1 className="room-head__title">{roomName}</h1>
        <IconButton
          label="공유"
          ref={shareRef}
          onClick={() => shareRef.current && onOpenShare(shareRef.current.getBoundingClientRect())}
        >
          <IconLink size={24} />
        </IconButton>
        <IconButton
          label="메뉴"
          ref={menuRef}
          onClick={() => menuRef.current && onOpenMenu(menuRef.current.getBoundingClientRect())}
        >
          <IconMore size={24} />
        </IconButton>
      </div>

      <div className="folder-tabs" role="tablist" aria-label="폴더">
        <button
          type="button"
          role="tab"
          className="folder-tab"
          aria-selected={activeFolderId === null}
          onClick={() => onSelectFolder(null)}
        >
          전체
          <span className="folder-tab__count">{totalCount}</span>
        </button>
        {folders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            role="tab"
            className="folder-tab"
            aria-selected={activeFolderId === folder.id}
            onClick={() => onSelectFolder(folder.id)}
          >
            {folder.name}
            <span className="folder-tab__count">{countInFolder(folder.id)}</span>
          </button>
        ))}
        <IconButton label="폴더 추가" className="folder-add" onClick={onAddFolder}>
          <IconPlus size={20} />
        </IconButton>
      </div>

      {totalCount > 0 && (
        <div className="filter-row" role="tablist" aria-label="사진 필터">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              className="filter-tab"
              aria-selected={filter === item.value}
              onClick={() => onChangeFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className="select-all"
            aria-pressed={allSelected}
            onClick={onToggleSelectAll}
          >
            전체 선택
            <span className="select-all__mark">
              <IconCheck size={13} />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
