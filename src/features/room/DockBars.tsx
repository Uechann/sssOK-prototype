import { useState } from 'react';
import type { TransferState, UploadItem, UploadStatus } from '../../types';
import {
  IconCheck,
  IconDownload,
  IconMoveFolder,
  IconTrash,
  IconWifiOff,
} from '../../components/Icons';
import { IconButton } from '../../components/ui';
import { useSmoothedPercent } from './useSmoothedPercent';
import './room.css';

/** 05-1 · 선택 시에만 노출되는 액션 바 */
export function SelectionBar({
  count,
  canDelete,
  onClear,
  onDownload,
  onDelete,
  onMove,
}: {
  count: number;
  canDelete: boolean;
  onClear: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onMove: () => void;
}) {
  return (
    <div className="dockbar dockbar--selection" role="toolbar" aria-label="선택 항목 작업">
      <span className="dockbar__count">
        <IconButton
          label="전체 선택 취소"
          onClick={onClear}
          style={{ width: 26, height: 26, borderRadius: 8 }}
        >
          <span className="dockbar__checked-icon">
            <IconCheck size={13} />
          </span>
        </IconButton>
        {count}개
      </span>
      <span className="dockbar__spacer" />
      <button type="button" className="dockbar__cta" onClick={onDownload}>
        <IconDownload size={18} />
        다운로드
      </button>
      <IconButton label="삭제" tone="danger" onClick={onDelete} disabled={!canDelete}>
        <IconTrash size={22} />
      </IconButton>
      <IconButton label="폴더로 이동" onClick={onMove}>
        <IconMoveFolder size={22} />
      </IconButton>
    </div>
  );
}

const STATE_LABEL: Record<UploadStatus, string> = {
  waiting: '대기',
  uploading: '진행 중',
  done: '완료',
  failed: '실패',
};

/** 07-1 · 업로드 / 다운로드 진행 표시.
 * 개수를 누르면 파일별 상태(대기 → 진행 → 완료/실패)를 펼쳐 볼 수 있습니다. */
export function TransferBar({
  transfer,
  items,
  onCancel,
}: {
  transfer: TransferState;
  items: UploadItem[];
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const label = transfer.label ?? (transfer.kind === 'upload' ? '업로드 중' : '다운로드 중');
  const displayPercent = useSmoothedPercent(transfer.percent);

  return (
    <>
      {open && items.length > 0 && (
        <div className="file-status">
          {items.map((item) => (
            <div className="file-status__row" key={item.id}>
              <span className="file-status__name">{item.name}</span>
              <span className="file-status__state" data-state={item.status}>
                {item.status === 'uploading' && item.progress > 0
                  ? `${item.progress}%`
                  : STATE_LABEL[item.status]}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="dockbar dockbar--transfer" role="status" aria-live="polite">
        <button
          type="button"
          className="dockbar__ratio"
          aria-expanded={open}
          disabled={items.length === 0}
          onClick={() => setOpen((prev) => !prev)}
        >
          {transfer.done} / {transfer.total}
        </button>
        <span
          className="dockbar__progress"
          style={{ '--transfer-progress': `${displayPercent}%` } as React.CSSProperties}
        >
          <span className="dockbar__progress-fill" aria-hidden="true" />
          <span className="dockbar__spinner" aria-hidden="true" />
          <span className="dockbar__progress-label">
            {label}... {displayPercent}%
          </span>
        </span>
        <button type="button" className="dockbar__cancel" onClick={onCancel}>
          취소
        </button>
      </div>
    </>
  );
}

/** 3f-b · 네트워크 끊김 배너 (업로드 중) */
export function NetworkBanner() {
  return (
    <div className="net-banner" role="status">
      <IconWifiOff size={22} />
      <div>
        <p className="net-banner__title">연결이 끊겼어요</p>
        <p className="net-banner__desc">재연결되면 이어서 올릴게요</p>
      </div>
    </div>
  );
}
